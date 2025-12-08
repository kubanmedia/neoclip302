/**
 * NeoClip 302 - Video Generation API
 * "Never-Fail" Multi-Provider Fallback Pipeline
 * 
 * Handles different API response formats from:
 * - Replicate (Wan-2.1) - returns { id, urls: { get } }
 * - FAL.ai (Pika) - returns { request_id } or uses queue system
 * - PiAPI (Luma) - returns { task_id } or { data: { task_id } }
 * 
 * Environment Variables Required:
 * - SUPABASE_URL, SUPABASE_KEY
 * - REPLICATE_KEY (for Wan-2.1)
 * - FAL_KEY (for Pika via FAL)
 * - PIAPI_KEY (for Luma - paid tier)
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/**
 * Provider Configurations
 * Ranked by cost (ascending) and quality (descending)
 */
const PROVIDERS = {
  // Replicate - Wan 2.1 (cheapest, good quality)
  wan: {
    name: 'Wan-2.1',
    createUrl: 'https://api.replicate.com/v1/predictions',
    getKey: () => process.env.REPLICATE_KEY,
    authHeader: (key) => `Token ${key}`,
    cost: 0.0008,
    buildBody: (prompt, length) => ({
      version: 'wan-lab/wan-2.1:e8c37be16be5e3bb950f55e0d73d1e87e4be5a47',
      input: {
        prompt: prompt,
        num_frames: Math.min(length, 10) * 24, // ~24fps
        guidance_scale: 7.5
      }
    }),
    extractTaskId: (response) => {
      // Replicate returns { id, urls: { get, cancel } }
      return response?.id || response?.prediction?.id;
    },
    getPollingUrl: (baseUrl, taskId) => {
      return `https://api.replicate.com/v1/predictions/${taskId}`;
    },
    extractVideoUrl: (response) => {
      // Replicate returns { output: [url] } or { output: url }
      if (response?.output) {
        return Array.isArray(response.output) ? response.output[0] : response.output;
      }
      return null;
    },
    isComplete: (response) => {
      return response?.status === 'succeeded' || response?.status === 'failed';
    },
    isFailed: (response) => {
      return response?.status === 'failed' || response?.error;
    }
  },

  // FAL.ai - Pika 2.2 (free credits, stylized)
  fal: {
    name: 'Pika-FAL',
    createUrl: 'https://queue.fal.run/fal-ai/minimax/video-01',
    getKey: () => process.env.FAL_KEY,
    authHeader: (key) => `Key ${key}`,
    cost: 0,
    buildBody: (prompt, length) => ({
      prompt: prompt,
      prompt_optimizer: true
    }),
    extractTaskId: (response) => {
      // FAL queue returns { request_id } or { status_url }
      return response?.request_id || response?.id || response?.task_id;
    },
    getPollingUrl: (baseUrl, taskId, createResponse) => {
      // FAL provides status_url in response
      if (createResponse?.status_url) {
        return createResponse.status_url;
      }
      // Or construct from request_id
      return `https://queue.fal.run/fal-ai/minimax/video-01/requests/${taskId}/status`;
    },
    getResultUrl: (baseUrl, taskId) => {
      return `https://queue.fal.run/fal-ai/minimax/video-01/requests/${taskId}`;
    },
    extractVideoUrl: (response) => {
      // FAL returns { video: { url } } or { output: { video_url } }
      return response?.video?.url || 
             response?.output?.video_url ||
             response?.video_url ||
             response?.result?.video?.url ||
             response?.data?.video_url;
    },
    isComplete: (response) => {
      const status = response?.status?.toLowerCase?.() || '';
      return status === 'completed' || status === 'succeeded' || status === 'ok';
    },
    isFailed: (response) => {
      const status = response?.status?.toLowerCase?.() || '';
      return status === 'failed' || status === 'error' || !!response?.error;
    }
  },

  // PiAPI - Luma Dream (highest quality, paid)
  luma: {
    name: 'Luma',
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
    extractTaskId: (response) => {
      // PiAPI returns { data: { task_id } } or { task_id }
      return response?.data?.task_id || response?.task_id || response?.id;
    },
    getPollingUrl: (baseUrl, taskId) => {
      return `https://api.piapi.ai/api/v1/task/${taskId}`;
    },
    extractVideoUrl: (response) => {
      // PiAPI returns { data: { output: { video_url } } }
      return response?.data?.output?.video_url ||
             response?.data?.video_url ||
             response?.output?.video_url ||
             response?.video_url ||
             response?.data?.output?.video ||
             response?.video;
    },
    isComplete: (response) => {
      const status = (response?.data?.status || response?.status || '').toLowerCase();
      return status === 'completed' || status === 'succeeded' || status === 'success';
    },
    isFailed: (response) => {
      const status = (response?.data?.status || response?.status || '').toLowerCase();
      return status === 'failed' || status === 'error';
    }
  }
};

/**
 * Fallback chains by tier
 */
const FALLBACK_CHAINS = {
  free: ['wan', 'fal'],
  paid: ['luma', 'wan', 'fal']
};

/**
 * Make API request with proper error handling
 */
async function makeRequest(url, options) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const status = response.status;
    let data = {};

    try {
      const text = await response.text();
      if (text) {
        data = JSON.parse(text);
      }
    } catch (e) {
      console.warn('Failed to parse response JSON:', e.message);
    }

    return { status, data, ok: response.ok, headers: response.headers };
  } catch (error) {
    console.error('Network request failed:', error.message);
    throw error;
  }
}

/**
 * Create video generation task
 */
async function createTask(provider, prompt, length) {
  const config = PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const key = config.getKey();
  if (!key) {
    console.error(`Missing API key for ${config.name}`);
    throw new Error(`Missing API key for ${config.name}`);
  }

  console.log(`[${config.name}] Creating task...`);

  const body = config.buildBody(prompt, length);
  
  const { status, data, ok } = await makeRequest(config.createUrl, {
    method: 'POST',
    headers: {
      'Authorization': config.authHeader(key)
    },
    body: JSON.stringify(body)
  });

  console.log(`[${config.name}] Create response: status=${status}`, JSON.stringify(data).slice(0, 500));

  // Check for auth errors
  if (status === 401 || status === 403) {
    const error = new Error(`Auth error: ${data?.detail || data?.message || data?.error || 'Unauthorized'}`);
    error.code = 'AUTH_ERROR';
    error.provider = config.name;
    throw error;
  }

  // Check for rate limit
  if (status === 429) {
    const error = new Error('Rate limited');
    error.code = 'RATE_LIMITED';
    error.provider = config.name;
    throw error;
  }

  // Check for client errors
  if (status >= 400 && status < 500) {
    const error = new Error(`Client error ${status}: ${JSON.stringify(data)}`);
    error.code = 'CLIENT_ERROR';
    error.provider = config.name;
    throw error;
  }

  // Extract task ID
  const taskId = config.extractTaskId(data);
  
  if (!taskId) {
    console.error(`[${config.name}] No task ID found in response:`, JSON.stringify(data));
    const error = new Error('No task ID in response');
    error.code = 'NO_TASK_ID';
    error.provider = config.name;
    error.responseData = data;
    throw error;
  }

  console.log(`[${config.name}] Task created: ${taskId}`);

  return {
    taskId,
    createResponse: data,
    provider: config.name
  };
}

/**
 * Poll for task completion
 */
async function pollTask(provider, taskId, createResponse, maxAttempts = 30, intervalMs = 4000) {
  const config = PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const key = config.getKey();
  const pollingUrl = config.getPollingUrl(config.createUrl, taskId, createResponse);

  console.log(`[${config.name}] Polling: ${pollingUrl}`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));

    try {
      const { status, data, ok } = await makeRequest(pollingUrl, {
        method: 'GET',
        headers: {
          'Authorization': config.authHeader(key)
        }
      });

      console.log(`[${config.name}] Poll ${attempt + 1}/${maxAttempts}: status=${status}`, 
        JSON.stringify(data).slice(0, 300));

      // Check for auth errors during polling
      if (status === 401 || status === 403) {
        const error = new Error('Auth error during polling');
        error.code = 'AUTH_ERROR';
        throw error;
      }

      // Check if failed
      if (config.isFailed(data)) {
        console.error(`[${config.name}] Task failed:`, data);
        throw new Error(`Task failed: ${data?.error || data?.message || 'Unknown error'}`);
      }

      // Check if complete and extract video URL
      if (config.isComplete(data)) {
        const videoUrl = config.extractVideoUrl(data);
        if (videoUrl) {
          console.log(`[${config.name}] Video ready: ${videoUrl.slice(0, 100)}...`);
          return videoUrl;
        }
        
        // If complete but no video, try result endpoint (FAL specific)
        if (config.getResultUrl) {
          const resultUrl = config.getResultUrl(config.createUrl, taskId);
          const resultResponse = await makeRequest(resultUrl, {
            method: 'GET',
            headers: {
              'Authorization': config.authHeader(key)
            }
          });
          const resultVideoUrl = config.extractVideoUrl(resultResponse.data);
          if (resultVideoUrl) {
            console.log(`[${config.name}] Video from result endpoint: ${resultVideoUrl.slice(0, 100)}...`);
            return resultVideoUrl;
          }
        }
      }

      // Also check for video URL even if status isn't "complete"
      const videoUrl = config.extractVideoUrl(data);
      if (videoUrl) {
        console.log(`[${config.name}] Video found: ${videoUrl.slice(0, 100)}...`);
        return videoUrl;
      }

    } catch (error) {
      if (error.code === 'AUTH_ERROR') throw error;
      console.warn(`[${config.name}] Poll error (attempt ${attempt + 1}):`, error.message);
      // Continue polling on other errors
    }
  }

  throw new Error(`Polling timeout after ${maxAttempts} attempts`);
}

/**
 * Generate video using fallback chain
 */
async function generateVideo(prompt, tier, length) {
  const chain = FALLBACK_CHAINS[tier] || FALLBACK_CHAINS.free;
  
  console.log(`Starting generation: tier=${tier}, chain=[${chain.join(', ')}]`);

  let lastError = null;

  for (const provider of chain) {
    const config = PROVIDERS[provider];
    console.log(`\n--- Trying ${config.name} (cost: $${config.cost}) ---`);

    // Check if API key exists
    const key = config.getKey();
    if (!key) {
      console.warn(`[${config.name}] Skipping - no API key configured`);
      continue;
    }

    for (let retry = 0; retry < 2; retry++) {
      try {
        // Create task
        const { taskId, createResponse } = await createTask(provider, prompt, length);

        // Poll for completion
        const videoUrl = await pollTask(provider, taskId, createResponse);

        if (videoUrl) {
          return {
            videoUrl,
            provider: config.name,
            cost: config.cost
          };
        }
      } catch (error) {
        lastError = error;
        console.error(`[${config.name}] Attempt ${retry + 1} failed:`, error.message);

        // Don't retry on auth errors - move to next provider
        if (error.code === 'AUTH_ERROR') {
          console.warn(`[${config.name}] Auth error - skipping to next provider`);
          break;
        }

        // Brief pause before retry
        if (retry < 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
  }

  // All providers failed
  throw lastError || new Error('All providers exhausted');
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    const { prompt, userId, tier = 'free', length = 10 } = req.body;

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

    // Check user quota
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('free_used, tier, resets_at')
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
          resets_at: nextMonth.toISOString().split('T')[0] 
        })
        .eq('id', userId);
      user.free_used = 0;
    }

    // Check free tier quota
    const FREE_LIMIT = 10;
    if (tier === 'free' && user.free_used >= FREE_LIMIT) {
      return res.status(402).json({ 
        error: 'Free limit reached',
        message: `You've used all ${FREE_LIMIT} free clips this month. Upgrade to Pro for unlimited HD clips!`,
        freeUsed: user.free_used,
        freeLimit: FREE_LIMIT
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

    try {
      // Generate video
      const result = await generateVideo(prompt, tier, length);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✅ SUCCESS: ${result.provider} in ${elapsed}s`);
      console.log(`Video: ${result.videoUrl.slice(0, 100)}...`);

      // Log to generations table
      await supabase.from('generations').insert({
        user_id: userId,
        prompt: prompt.slice(0, 500),
        tier,
        model: result.provider,
        video_url: result.videoUrl,
        cost: result.cost,
        duration_ms: Date.now() - startTime,
        created_at: new Date().toISOString()
      }).catch(err => console.warn('Failed to log generation:', err));

      return res.status(200).json({
        success: true,
        videoUrl: result.videoUrl,
        tier,
        model: result.provider,
        needsAd: tier === 'free',
        remainingFree: tier === 'free' ? FREE_LIMIT - (originalUsage + 1) : null,
        generationTime: `${elapsed}s`
      });

    } catch (generationError) {
      // Rollback usage on failure
      if (tier === 'free') {
        await supabase
          .from('users')
          .update({ free_used: originalUsage })
          .eq('id', userId);
      }

      throw generationError;
    }

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n❌ FAILED after ${elapsed}s:`, error.message);

    return res.status(500).json({ 
      error: 'Generation failed',
      message: error.message || 'All providers exhausted - please try again',
      duration: `${elapsed}s`
    });
  }
}
