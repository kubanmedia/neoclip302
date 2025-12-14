/**
 * NeoClip 302 - Video Generation API v3.3.0
 * Async Task Creation Pattern (No Vercel Timeout Issues)
 * 
 * ARCHITECTURE:
 * 1. /api/generate - Creates task, starts generation, returns taskId immediately
 * 2. /api/poll - Client polls this to check generation status
 * 
 * This avoids Vercel's 300s timeout by not blocking on video completion.
 * 
 * Providers:
 * - FAL.ai MiniMax (free tier) - Fast, good quality
 * - Replicate Wan-2.1 (backup) - Cheap, reliable
 * - PiAPI Luma (paid tier) - Highest quality
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

/**
 * Provider Configurations with improved API handling
 */
const PROVIDERS = {
  // FAL.ai - MiniMax Video (Primary for free tier)
  fal: {
    name: 'MiniMax-FAL',
    tier: 'free',
    createUrl: 'https://queue.fal.run/fal-ai/minimax/video-01',
    getKey: () => process.env.FAL_KEY,
    authHeader: (key) => `Key ${key}`,
    cost: 0,
    buildBody: (prompt, length) => ({
      prompt: prompt,
      prompt_optimizer: true
    }),
    extractTaskId: (response) => response?.request_id,
    getStatusUrl: (taskId) => `https://queue.fal.run/fal-ai/minimax/video-01/requests/${taskId}/status`,
    getResultUrl: (taskId) => `https://queue.fal.run/fal-ai/minimax/video-01/requests/${taskId}`,
    parseStatus: (response) => {
      const status = response?.status?.toLowerCase?.() || '';
      if (status === 'completed' || status === 'succeeded' || response?.video?.url) {
        return 'completed';
      }
      if (status === 'failed' || status === 'error') {
        return 'failed';
      }
      return 'processing';
    },
    extractVideoUrl: (response) => {
      return response?.video?.url || 
             response?.output?.video_url ||
             response?.video_url ||
             response?.result?.video?.url;
    },
    extractError: (response) => response?.error || response?.message
  },

  // Replicate - Wan 2.1 (Backup provider)
  wan: {
    name: 'Wan-2.1',
    tier: 'free',
    createUrl: 'https://api.replicate.com/v1/predictions',
    getKey: () => process.env.REPLICATE_KEY,
    authHeader: (key) => `Token ${key}`,
    cost: 0.0008,
    buildBody: (prompt, length) => ({
      version: 'wan-lab/wan-2.1:e8c37be16be5e3bb950f55e0d73d1e87e4be5a47',
      input: {
        prompt: prompt,
        num_frames: Math.min(length || 10, 10) * 24,
        guidance_scale: 7.5
      }
    }),
    extractTaskId: (response) => response?.id,
    getStatusUrl: (taskId) => `https://api.replicate.com/v1/predictions/${taskId}`,
    getResultUrl: (taskId) => `https://api.replicate.com/v1/predictions/${taskId}`,
    parseStatus: (response) => {
      const status = response?.status?.toLowerCase?.() || '';
      if (status === 'succeeded') return 'completed';
      if (status === 'failed' || status === 'canceled') return 'failed';
      return 'processing';
    },
    extractVideoUrl: (response) => {
      const output = response?.output;
      return Array.isArray(output) ? output[0] : output;
    },
    extractError: (response) => response?.error
  },

  // PiAPI - Luma Dream Machine (Paid tier)
  luma: {
    name: 'Luma',
    tier: 'paid',
    createUrl: 'https://api.piapi.ai/api/v1/task',
    getKey: () => process.env.PIAPI_KEY,
    authHeader: (key) => `Bearer ${key}`,
    cost: 0.20,
    buildBody: (prompt, length) => ({
      model: 'luma',
      task_type: 'video_generation',
      input: {
        prompt: prompt,
        expand_prompt: true,
        aspect_ratio: '16:9'
      }
    }),
    extractTaskId: (response) => response?.data?.task_id || response?.task_id,
    getStatusUrl: (taskId) => `https://api.piapi.ai/api/v1/task/${taskId}`,
    getResultUrl: (taskId) => `https://api.piapi.ai/api/v1/task/${taskId}`,
    parseStatus: (response) => {
      const status = (response?.data?.status || response?.status || '').toLowerCase();
      if (status === 'completed' || status === 'succeeded' || status === 'success') return 'completed';
      if (status === 'failed' || status === 'error') return 'failed';
      return 'processing';
    },
    extractVideoUrl: (response) => {
      return response?.data?.output?.video_url ||
             response?.data?.video_url ||
             response?.output?.video_url ||
             response?.video_url;
    },
    extractError: (response) => response?.data?.error || response?.error || response?.message
  }
};

/**
 * Provider fallback chains by tier
 */
const FALLBACK_CHAINS = {
  free: ['fal', 'wan'],
  paid: ['luma', 'fal', 'wan']
};

/**
 * Make HTTP request with timeout and error handling
 */
async function makeRequest(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const text = await response.text();
    let data = {};
    
    try {
      if (text) data = JSON.parse(text);
    } catch (e) {
      console.warn('Response not JSON:', text.slice(0, 200));
    }

    return { 
      status: response.status, 
      data, 
      ok: response.ok,
      error: !response.ok ? (data.error || data.message || `HTTP ${response.status}`) : null
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { status: 408, data: {}, ok: false, error: 'Request timeout' };
    }
    return { status: 0, data: {}, ok: false, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Create generation task with a provider
 */
async function createProviderTask(providerKey, prompt, length) {
  const provider = PROVIDERS[providerKey];
  if (!provider) throw new Error(`Unknown provider: ${providerKey}`);

  const apiKey = provider.getKey();
  if (!apiKey) {
    throw new Error(`No API key configured for ${provider.name}`);
  }

  console.log(`[${provider.name}] Creating task...`);

  const body = provider.buildBody(prompt, length);
  const { status, data, ok, error } = await makeRequest(provider.createUrl, {
    method: 'POST',
    headers: { 'Authorization': provider.authHeader(apiKey) },
    body: JSON.stringify(body)
  });

  console.log(`[${provider.name}] Response: ${status}`, JSON.stringify(data).slice(0, 500));

  // Handle errors
  if (status === 401 || status === 403) {
    throw new Error(`Auth error for ${provider.name}: ${error || 'Unauthorized'}`);
  }
  if (status === 429) {
    throw new Error(`Rate limited on ${provider.name}`);
  }
  if (!ok) {
    throw new Error(`${provider.name} error (${status}): ${error || JSON.stringify(data)}`);
  }

  // Extract task ID
  const taskId = provider.extractTaskId(data);
  if (!taskId) {
    console.error(`[${provider.name}] No task ID in response:`, data);
    throw new Error(`No task ID from ${provider.name}`);
  }

  console.log(`[${provider.name}] Task created: ${taskId}`);

  return {
    providerTaskId: taskId,
    provider: providerKey,
    providerName: provider.name,
    cost: provider.cost
  };
}

/**
 * Try to create task with fallback chain
 */
async function createTaskWithFallback(prompt, tier, length) {
  const chain = FALLBACK_CHAINS[tier] || FALLBACK_CHAINS.free;
  
  console.log(`Creating task: tier=${tier}, chain=[${chain.join(', ')}]`);

  let lastError = null;

  for (const providerKey of chain) {
    const provider = PROVIDERS[providerKey];
    const apiKey = provider?.getKey();

    if (!apiKey) {
      console.warn(`[${provider?.name || providerKey}] Skipping - no API key`);
      continue;
    }

    try {
      return await createProviderTask(providerKey, prompt, length);
    } catch (error) {
      console.error(`[${provider?.name || providerKey}] Failed:`, error.message);
      lastError = error;
      // Continue to next provider
    }
  }

  throw lastError || new Error('All providers failed to create task');
}

/**
 * Main Handler - Creates task and returns immediately
 */
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

  const startTime = Date.now();

  try {
    const { prompt, userId, tier = 'free', length = 10 } = req.body || {};

    // Validate input
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    console.log(`\n========== New Generation Request ==========`);
    console.log(`User: ${userId}, Tier: ${tier}, Length: ${length}s`);
    console.log(`Prompt: ${prompt.slice(0, 100)}...`);

    // Check user in database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, free_used, paid_used, tier, resets_at')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('User lookup failed:', userError);
      return res.status(404).json({ error: 'User not found' });
    }

    // Check monthly reset
    const now = new Date();
    const resetsAt = new Date(user.resets_at);
    if (now >= resetsAt) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      await supabase
        .from('users')
        .update({ 
          free_used: 0, 
          paid_used: 0,
          resets_at: nextMonth.toISOString().split('T')[0] 
        })
        .eq('id', userId);
      user.free_used = 0;
      user.paid_used = 0;
    }

    // Check free tier quota
    const FREE_LIMIT = 10;
    if (tier === 'free' && user.free_used >= FREE_LIMIT) {
      return res.status(402).json({ 
        error: 'Free limit reached',
        message: `You've used all ${FREE_LIMIT} free clips this month. Upgrade to Pro!`,
        freeUsed: user.free_used,
        freeLimit: FREE_LIMIT
      });
    }

    // Create task with provider (with fallback)
    const taskResult = await createTaskWithFallback(prompt, tier, length);

    // Create generation record in database
    const generationId = crypto.randomUUID ? crypto.randomUUID() : `gen-${Date.now()}`;
    
    const { error: insertError } = await supabase
      .from('generations')
      .insert({
        id: generationId,
        user_id: userId,
        task_id: taskResult.providerTaskId,
        prompt: prompt.slice(0, 500),
        tier,
        model: taskResult.providerName,
        provider: taskResult.provider,
        duration: length,
        status: 'processing',
        cost: taskResult.cost,
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Failed to insert generation record:', insertError);
      // Continue anyway - generation is running
    }

    // Increment usage counter
    if (tier === 'free') {
      await supabase
        .from('users')
        .update({ free_used: user.free_used + 1 })
        .eq('id', userId);
    } else {
      await supabase
        .from('users')
        .update({ paid_used: (user.paid_used || 0) + 1 })
        .eq('id', userId);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Task created in ${elapsed}s: ${generationId}`);

    // Return immediately with task info for client polling
    return res.status(200).json({
      success: true,
      status: 'processing',
      generationId: generationId,
      taskId: taskResult.providerTaskId,
      provider: taskResult.provider,
      providerName: taskResult.providerName,
      tier,
      needsAd: tier === 'free',
      remainingFree: tier === 'free' ? FREE_LIMIT - (user.free_used + 1) : null,
      message: 'Video generation started. Poll /api/poll for status.',
      pollUrl: `/api/poll?generationId=${generationId}`,
      estimatedTime: '30-90 seconds'
    });

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n❌ FAILED after ${elapsed}s:`, error.message);

    return res.status(500).json({ 
      error: 'Generation failed',
      message: error.message || 'Failed to start video generation',
      duration: `${elapsed}s`
    });
  }
}
