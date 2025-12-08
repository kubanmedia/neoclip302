// /api/generate.js  ––  ZERO-COST MULTI-FALLBACK  ––  Dec 2025
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/*  FALLBACK CHAIN  –– ranked: cost asc, quality desc  */
const FALLBACKS = {
  free: [
    /* 1 */ { name: 'Wan',     url: 'https://api.replicate.com/v1/predictions', key: process.env.REPLICATE_KEY, version: 'chenxwh/wan-2.1-1.3b', cost: 0.0008 },
    /* 2 */ { name: 'Pika-FAL',url: 'https://fal.run/fal-ai/pika/v2.2/text-to-video', key: process.env.FAL_KEY, cost: 0 } // 100 free clips / account
  ],
  paid: [
    /* 3 */ { name: 'Luma',    url: 'https://api.piapi.ai/v1/luma/video', key: process.env.PIAPI_KEY, cost: 0.20 }
  ]
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt, userId, tier = 'free', length = 10 } = req.body;
  if (!prompt || !userId) return res.status(400).json({ error: 'Missing prompt or userId' });

  /* ----------  QUOTA GUARD  ---------- */
  const { data: u } = await supabase.from('users').select('free_used, tier').eq('id', userId).single();
  if (tier === 'free' && u.free_used >= 10) return res.status(402).json({ error: 'Free limit reached – upgrade for 120 HD clips' });
  await supabase.from('users').update({ free_used: u.free_used + 1 }).eq('id', userId);

  /* ----------  ROTATION LOOP  ---------- */
  const chain = FALLBACKS[tier];
  let videoUrl = null;
  let usedModel = null;

  for (const m of chain) {
    for (let retry = 0; retry < 2; retry++) {
      try {
        /* ---- 1. START TASK ---- */
        const body = m.name === 'Wan'
          ? { version: m.version, input: { prompt, duration: Math.min(length, 10) } }
          : m.name === 'Pika-FAL'
          ? { prompt, duration: Math.min(length, 10), resolution: '768p' }
          : { prompt, duration: Math.min(length, 30), resolution: '1080p' };

        const r1 = await fetch(m.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${m.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const j1 = await r1.json();
        if (!j1.id) throw new Error('No task id');

        /* ---- 2. POLL ---- */
        for (let i = 0; i < 20; i++) { // 80 s max
          await new Promise(res => setTimeout(res, 4000));
          const r2 = await fetch(`${m.url}/${j1.id}`, {
            headers: { Authorization: `Bearer ${m.key}` }
          });
          const j2 = await r2.json();
          videoUrl = j2.output?.[0] || j2.video_url || j2.url;
          if (videoUrl) break;
        }
        if (videoUrl) { usedModel = m.name; break; }
      } catch (e) {
        console.log(`${m.name} retry ${retry}`, e.message);
      }
    }
    if (videoUrl) break;
  }

  /* ----------  FAIL  ---------- */
  if (!videoUrl) {
    await supabase.from('users').update({ free_used: u.free_used }).eq('id', userId); // rollback
    return res.status(500).json({ error: 'All fallbacks exhausted—please retry later' });
  }

  /* ----------  SUCCESS  ---------- */
  res.json({ videoUrl, tier, model: usedModel, needsAd: tier === 'free' });
}
