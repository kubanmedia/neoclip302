/**
 * NeoClip Production - Video Generation API
 * Deploy as Vercel serverless function
 * 
 * SECURITY: All sensitive keys are stored in Vercel Environment Variables
 * Configure in Vercel Dashboard > Settings > Environment Variables:
 * - PIAPI_KEY
 * - FAL_KEY
 * - SUPABASE_URL
 * - SUPABASE_KEY
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables - configured in Vercel Dashboard
const PIAPI_KEY = process.env.PIAPI_KEY;
const FAL_KEY = process.env.FAL_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Validate environment variables
const validateEnv = () => {
  const required = ['PIAPI_KEY', 'FAL_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

// Initialize Supabase client
const getSupabaseClient = () => {
  return createClient(SUPABASE_URL, SUPABASE_KEY);
};

// API configurations
const API_CONFIG = {
  free: {
    url: 'https://api.piapi.ai/v1/video/generations',
    getHeaders: () => ({
      'Authorization': `Bearer ${PIAPI_KEY}`,
      'Content-Type': 'application/json'
    }),
    getBody: (prompt, length) => ({
      model: 'minimax/hailuo-02',
      prompt,
      length: Math.min(length, 10),
      resolution: '768p'
    }),
    getTaskId: (response) => response.taskId,
    getStatusUrl: (taskId) => `https://api.piapi.ai/v1/video/generations/${taskId}`,
    getVideoUrl: (response) => response.video_url
  },
  paid: {
    url: 'https://fal.run/fal-ai/kling-video/v2.5-turbo/text-to-video',
    getHeaders: () => ({
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json'
    }),
    getBody: (prompt, length) => ({
      prompt,
      duration: Math.min(length, 30),
      resolution: '1080p'
    }),
    getTaskId: (response) => response.id,
    getStatusUrl: (taskId) => `https://fal.run/fal-ai/kling-video/v2.5-turbo/text-to-video/${taskId}`,
    getVideoUrl: (response) => response?.video?.url
  }
};

// Constants
const FREE_MONTHLY_LIMIT = 10;
const POLL_INTERVAL_MS = 8000;
const MAX_POLL_ATTEMPTS = 20;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate environment
    validateEnv();
    
    const supabase = getSupabaseClient();
    const { prompt, userId, tier = 'free', length = 10 } = req.body;

    // Input validation
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get user data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('free_used, tier, resets_at')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if monthly reset is needed
    const now = new Date();
    const resetsAt = new Date(user.resets_at);
    if (now >= resetsAt) {
      // Reset free usage for new month
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      await supabase
        .from('users')
        .update({ 
          free_used: 0, 
          resets_at: nextMonth.toISOString().split('T')[0] 
        })
        .eq('id', userId);
      user.free_used = 0;
    }

    // Quota guard for free tier
    if (tier === 'free' && user.free_used >= FREE_MONTHLY_LIMIT) {
      return res.status(402).json({ 
        error: 'Free limit reached',
        message: `You've used all ${FREE_MONTHLY_LIMIT} free clips this month. Upgrade to Pro for unlimited HD clips!`,
        upgradeUrl: '/upgrade'
      });
    }

    // Increment usage before generation
    const originalUsage = user.free_used;
    if (tier === 'free') {
      await supabase
        .from('users')
        .update({ free_used: user.free_used + 1 })
        .eq('id', userId);
    }

    // Select API configuration
    const config = tier === 'free' ? API_CONFIG.free : API_CONFIG.paid;

    try {
      // Start video generation
      const generateResponse = await fetch(config.url, {
        method: 'POST',
        headers: config.getHeaders(),
        body: JSON.stringify(config.getBody(prompt, length))
      });

      if (!generateResponse.ok) {
        const errorText = await generateResponse.text();
        throw new Error(`API error: ${generateResponse.status} - ${errorText}`);
      }

      const generateData = await generateResponse.json();
      const taskId = config.getTaskId(generateData);

      if (!taskId) {
        throw new Error('No task ID received from API');
      }

      // Poll for completion
      let videoUrl = null;
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

        const statusResponse = await fetch(config.getStatusUrl(taskId), {
          headers: config.getHeaders()
        });

        if (!statusResponse.ok) {
          continue; // Retry on status check failure
        }

        const statusData = await statusResponse.json();
        videoUrl = config.getVideoUrl(statusData);

        if (videoUrl) {
          break;
        }
      }

      if (!videoUrl) {
        throw new Error('Video generation timed out');
      }

      // Log successful generation
      await supabase
        .from('generations')
        .insert({
          user_id: userId,
          prompt: prompt.substring(0, 500),
          tier,
          video_url: videoUrl,
          length,
          created_at: new Date().toISOString()
        });

      return res.status(200).json({
        success: true,
        videoUrl,
        tier,
        remainingFree: tier === 'free' ? FREE_MONTHLY_LIMIT - (originalUsage + 1) : null
      });

    } catch (generationError) {
      // Rollback usage on generation failure
      if (tier === 'free') {
        await supabase
          .from('users')
          .update({ free_used: originalUsage })
          .eq('id', userId);
      }
      throw generationError;
    }

  } catch (error) {
    console.error('Generation error:', error);
    return res.status(500).json({ 
      error: 'Generation failed',
      message: error.message 
    });
  }
}


import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const FALLBACKS = {
  free: [
    { name:'Wan',     url:'https://api.replicate.com/v1/predictions', key:process.env.REPLICATE_KEY, version:'wan-2.1-1.3b', cost:0.0008 },
    { name:'Pika',    url:'https://api.pika.art/v1/videos',          key:process.env.PIKA_KEY,       cost:0 }
  ],
  paid: [
    { name:'Luma',    url:'https://api.piapi.ai/v1/luma/video',      key:process.env.PIAPI_KEY,      cost:0.20 }
  ]
};

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).end();
  const {prompt,userId,tier='free',length=10} = req.body;

  // quota guard
  const {data:u} = await supabase.from('users').select('free_used,tier').eq('id',userId).single();
  if(tier==='free' && u.free_used>=10) return res.status(402).json({error:'Free limit'});
  await supabase.from('users').update({free_used:u.free_used+1}).eq('id',userId);

  // rotate chain
  const chain = FALLBACKS[tier];
  let url = null;
  for(const m of chain){
    for(let r=0;r<2;r++){
      try{
        const {id} = await fetch(m.url,{
          method:'POST',
          headers:{Authorization:`Bearer ${m.key}`,'Content-Type':'application/json'},
          body:JSON.stringify({prompt,duration:length,version:m.version})
        }).then(d=>d.json());
        for(let i=0;i<15;i++){
          await new Promise(res=>setTimeout(res,4000));
          const {output,video_url} = await fetch(`${m.url}/${id}`,{headers:{Authorization:`Bearer ${m.key}`}}).then(d=>d.json());
          url = output?.[0] || video_url;
          if(url) break;
        }
        if(url) break;
      }catch(e){console.log(`${m.name} retry ${r}`,e.message)}
    }
    if(url) break;
  }

  if(!url){
    await supabase.from('users').update({free_used:u.free_used}).eq('id',userId); // rollback
    return res.status(500).json({error:'All fallbacks exhausted'});
  }
  res.json({videoUrl:url,needsAd:tier==='free'});
}
