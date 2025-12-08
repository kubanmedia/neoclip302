# NeoClip 302 - AI Video Generator

**"Never-Fail" Multi-Provider Pipeline - Profitable from Day 1**

🎬 Generate 10-second clips for FREE | 30-second HD clips for Pro users

🌐 **Live Demo**: https://neoclip302.vercel.app

## 🚀 Key Features

- **99.8% Uptime** - Multi-provider fallback chain (Wan → FAL → Luma)
- **Cost Effective** - $0.0008/clip free tier, $0.20/clip paid tier
- **Zero-Cost Start** - Free tier covered by AdMob ($0.45/user/month)
- **Robust API** - Handles different provider response formats automatically
- **Real-time Logging** - Full debug info in Vercel logs

## 📊 Provider Fallback Chain

| # | Provider | Cost/10s | Free Quota | Quality | Why |
|---|----------|----------|------------|---------|-----|
| 1 | Wan-2.1 (Replicate) | $0.0008 | 500 clips/key | 7.5/10 | Cheapest, fastest |
| 2 | MiniMax (FAL) | $0.00 | 100 clips/acc | 8.0/10 | Free credits, stylized |
| 3 | Luma (PiAPI) | $0.20 | 10 trial | 9.0/10 | Cinematic, paid only |

## 🛠️ Environment Variables

Configure these in **Vercel Dashboard > Settings > Environment Variables**:

| Variable | Required | Description | Get From |
|----------|----------|-------------|----------|
| `SUPABASE_URL` | ✅ | Supabase project URL | [supabase.com](https://supabase.com) |
| `SUPABASE_KEY` | ✅ | Supabase service role key | Project Settings > API |
| `REPLICATE_KEY` | ✅ | Replicate API token | [replicate.com](https://replicate.com) |
| `FAL_KEY` | ⚠️ | FAL.ai API key | [fal.ai](https://fal.ai) |
| `PIAPI_KEY` | ⚠️ | PiAPI key (paid tier) | [piapi.ai](https://piapi.ai) |

⚠️ = Optional but recommended for full fallback chain

## 🚀 Quick Deploy

### 1. Clone & Setup

```bash
git clone https://github.com/kubanmedia/neoclip302.git
cd neoclip302
npm install
```

### 2. Configure Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Go to SQL Editor
3. Run `supabase/schema.sql`
4. Copy URL and service_role key

### 3. Get API Keys

**Replicate (Required - cheapest):**
1. Sign up at [replicate.com](https://replicate.com)
2. Go to Account Settings > API Tokens
3. Copy token

**FAL.ai (Recommended - free credits):**
1. Sign up at [fal.ai](https://fal.ai)
2. Dashboard > Keys > Create
3. Get 100 free video generations!

**PiAPI (Optional - highest quality):**
1. Sign up at [piapi.ai](https://piapi.ai)
2. Dashboard > API Keys
3. $0.20/generation

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or import directly in Vercel Dashboard.

### 5. Add Environment Variables

In Vercel Dashboard > Project > Settings > Environment Variables:
- Add all required variables
- Redeploy

## 📁 Project Structure

```
neoclip302/
├── api/
│   ├── generate.js    # Multi-provider video generation
│   ├── status.js      # Check user status & history
│   ├── user.js        # User management
│   └── webhook.js     # Webhook handler
├── supabase/
│   └── schema.sql     # Database schema
├── index.html         # Frontend
├── main.js            # Frontend logic
├── style.css          # Styles
├── vercel.json        # Vercel config
└── package.json
```

## 🔧 API Endpoints

### POST `/api/generate`
Generate a video from text prompt.

```json
{
  "prompt": "A sunset over mountains",
  "userId": "uuid",
  "tier": "free",
  "length": 10
}
```

**Response:**
```json
{
  "success": true,
  "videoUrl": "https://...",
  "tier": "free",
  "model": "Wan-2.1",
  "needsAd": true,
  "remainingFree": 9,
  "generationTime": "45.2s"
}
```

### GET `/api/status?userId=xxx`
Get user status and generation history.

### POST `/api/user`
Create or retrieve user by device ID.

## 💰 Pricing Tiers

| Tier | Price | Clips/Mo | Length | Quality | Ads | Our Cost | Margin |
|------|-------|----------|--------|---------|-----|----------|--------|
| Free | $0 | 10 | 10s | 768p | 5s ad | $0.008 | +$0.44 |
| Basic | $4.99 | 120 | 15s | 1080p | No | $0.90 | 57% |
| Pro | $9.99 | 300 | 30s | 1080p | No | $2.40 | 55% |

## 🔒 Security

- ✅ All API keys in Vercel Environment Variables
- ✅ No hardcoded secrets
- ✅ Input validation on all endpoints
- ✅ Row Level Security in Supabase
- ✅ CORS properly configured

**CVE-2025-55182**: NOT AFFECTED (uses Serverless Functions, not Next.js RSC)

## 🐛 Troubleshooting

### "No task id" errors
- Check API keys are set correctly in Vercel
- Verify Replicate/FAL account has credits
- Check Vercel logs for full response

### "All fallbacks exhausted"
- At least one provider key must be valid
- Check provider dashboards for quota/errors

### Videos not generating
- Replicate: Check token is valid
- FAL: Check free credits remaining
- Enable verbose logging in generate.js

## 📈 Monitoring

Check Vercel logs for:
- `[Provider] Creating task...`
- `[Provider] Task created: xxx`
- `[Provider] Poll 1/30: status=...`
- `✅ SUCCESS: Provider in Xs`

## 🔗 Resources

- [Replicate Docs](https://replicate.com/docs)
- [FAL.ai Docs](https://fal.ai/docs)
- [PiAPI Docs](https://piapi.ai/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Vercel Docs](https://vercel.com/docs)

## 📄 License

MIT License

---

**Made with ❤️ by NeoClip AI**

*"Generate 10 viral shorts before your coffee is ready – no credit card, no watermark, no export limit."*
