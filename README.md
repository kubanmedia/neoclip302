# NeoClip Production

**Zero-cost, profitable-from-day-1 AI video generator**

Generate 10-second viral shorts for FREE, 30-second HD clips for Pro users.

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/NeoClipAI/neoclip-production
cd neoclip-production
npm install
```

### 2. Configure Environment Variables

**IMPORTANT: All sensitive keys are stored in Vercel Environment Variables - NEVER hardcode them!**

#### Option A: Vercel Dashboard (Recommended)
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project → Settings → Environment Variables
3. Add the following variables:

| Variable | Description | Get From |
|----------|-------------|----------|
| `PIAPI_KEY` | PiAPI key for free tier | [piapi.ai/dashboard](https://piapi.ai) |
| `FAL_KEY` | FAL.ai key for paid tier | [fal.ai/dashboard](https://fal.ai) |
| `SUPABASE_URL` | Supabase project URL | [supabase.com](https://supabase.com) |
| `SUPABASE_KEY` | Supabase service role key | Project Settings > API |
| `WEBHOOK_SECRET` | (Optional) Webhook verification | `openssl rand -hex 32` |

#### Option B: Vercel CLI Secrets
```bash
vercel secrets add piapi_key "your_key"
vercel secrets add fal_key "your_key"
vercel secrets add supabase_url "https://xxx.supabase.co"
vercel secrets add supabase_key "your_service_role_key"
```

### 3. Set Up Database

1. Create a free Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor
3. Copy and run `supabase/schema.sql`

### 4. Deploy

```bash
# Deploy to Vercel
vercel --prod

# Or link existing project
vercel link
vercel --prod
```

### 5. Configure Mobile App

1. Open `app/app.json`
2. Update `extra.apiBaseUrl` with your Vercel URL
3. Add your AdMob IDs (optional)

```bash
cd app
npm install
expo start
```

## 📁 Project Structure

```
neoclip-production/
├── api/                    # Vercel serverless functions
│   ├── generate.js         # Video generation endpoint
│   ├── webhook.js          # Webhook handler
│   ├── status.js           # Generation status check
│   └── user.js             # User management
├── app/                    # Expo React Native app
│   ├── App.js              # Main app component
│   ├── app.json            # Expo configuration
│   └── package.json        # App dependencies
├── supabase/
│   └── schema.sql          # Database schema
├── vercel.json             # Vercel configuration
├── package.json            # API dependencies
├── .env.example            # Environment template
└── README.md               # This file
```

## 🔒 Security Notes

**CVE-2025-55182 Advisory Response:**
This project uses Vercel Serverless Functions (NOT Next.js with React Server Components), so it is **NOT affected** by CVE-2025-55182. However, we follow security best practices:

- ✅ All API keys stored in Vercel Environment Variables
- ✅ No hardcoded secrets in code
- ✅ Service role key used only server-side
- ✅ Input validation on all endpoints
- ✅ CORS headers properly configured
- ✅ Webhook signature verification (optional)

## 📊 API Endpoints

### POST `/api/generate`
Generate a video from a text prompt.

**Request:**
```json
{
  "prompt": "A cat playing piano in space",
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
  "remainingFree": 9
}
```

### GET `/api/status`
Check generation status or user info.

**Query params:** `?taskId=xxx` or `?userId=xxx`

### POST `/api/user`
Create or get user by device ID.

**Request:**
```json
{
  "deviceId": "device-identifier"
}
```

### POST `/api/webhook`
Receive callbacks from video generation APIs.

## 💰 Pricing Model

| Tier | Price | Clips/Mo | Max Length | Quality | Ads |
|------|-------|----------|------------|---------|-----|
| Free | $0 | 10 | 10s | 768p | 5s end-card |
| Basic | $4.99 | 120 | 15s | 1080p | No |
| Pro | $9.99 | 300 | 30s | 1080p | No |
| Boost | $1.99 | +20 | - | - | - |

## 🛠️ Development

### Local Development
```bash
# Copy environment template
cp .env.example .env.local

# Edit with your keys
nano .env.local

# Start local dev server
npm run dev
```

### Testing
```bash
# Test generate endpoint
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","userId":"test-user","tier":"free"}'
```

## 📱 Mobile App Setup

```bash
cd app
npm install

# Start Expo
expo start

# Or run on specific platform
expo start --ios
expo start --android
```

### AdMob Integration (Optional)
1. Create AdMob account at [admob.google.com](https://admob.google.com)
2. Create a Rewarded Ad unit (5s)
3. Update IDs in `app/app.json`:
   - `ios.config.googleMobileAdsAppId`
   - `android.config.googleMobileAdsAppId`
   - `extra.admobRewardedId`

## 🔗 Resources

- [PiAPI Documentation](https://piapi.ai/docs)
- [FAL.ai Documentation](https://fal.ai/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Expo Documentation](https://docs.expo.dev)

## 📄 License

MIT License - see LICENSE file for details.

---

**Made with ❤️ by NeoClip AI**

"Generate 10 viral shorts before your coffee is ready – no credit card, no watermark, no export limit."
