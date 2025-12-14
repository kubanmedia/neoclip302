# NeoClip 302 - AI Video Generator

> Generate viral short videos with AI. 10 free clips per month, no credit card needed.

**Version:** 3.3.0  
**Live Demo:** https://neoclip302.vercel.app  
**GitHub:** https://github.com/kubanmedia/neoclip302

## 🎬 Overview

NeoClip is an AI-powered video generator that creates short viral clips from text prompts. Built with a modern architecture designed for reliability and scalability.

### Key Features

- ✅ **10 FREE clips per month** - No credit card required
- ✅ **No watermark** - Clean exports ready for social media
- ✅ **Unlimited downloads** - Export as many times as you want
- ✅ **Multi-provider fallback** - Automatic failover between AI providers
- ✅ **Async generation** - No timeout issues, poll-based status updates

## 🏗️ Architecture (v3.3.0)

### Problem Solved
Previous versions suffered from **Vercel 300s timeout errors** because the API would wait synchronously for video generation to complete (30-120 seconds per video).

### Solution: Async Task Pattern
```
1. POST /api/generate → Creates task, returns generationId immediately (<5s)
2. Client polls GET /api/poll?generationId=xxx every 3 seconds
3. When status='completed', client gets videoUrl
```

This pattern completely eliminates timeout issues since no single API call exceeds 60 seconds.

## 📁 Project Structure

```
neoclip302/
├── api/                    # Vercel serverless functions
│   ├── generate.js         # Creates generation task (async)
│   ├── poll.js             # Polls task status
│   ├── user.js             # User management
│   ├── status.js           # User generations list
│   └── webhook.js          # Provider webhooks
├── app/                    # Expo React Native app (mobile)
│   ├── App.js              # Main mobile app
│   └── app.json            # Expo configuration
├── supabase/
│   └── schema.sql          # Complete database schema
├── index.html              # Web app entry point
├── main.js                 # Frontend JavaScript
├── style.css               # Styles
├── vercel.json             # Vercel configuration
└── package.json            # Dependencies
```

## 🚀 API Endpoints

### POST /api/generate
Creates a new video generation task.

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
  "status": "processing",
  "generationId": "uuid",
  "taskId": "provider-task-id",
  "provider": "fal",
  "pollUrl": "/api/poll?generationId=uuid",
  "estimatedTime": "30-90 seconds"
}
```

### GET /api/poll?generationId=xxx
Polls generation status.

**Response (processing):**
```json
{
  "success": true,
  "status": "processing",
  "progress": 45,
  "elapsed": "32s"
}
```

**Response (completed):**
```json
{
  "success": true,
  "status": "completed",
  "videoUrl": "https://...",
  "progress": 100,
  "generationTime": "45.2s"
}
```

### POST /api/user
Get or create user by device ID.

### GET /api/status?userId=xxx
Get user's generations history.

## 🎯 Providers

| Provider | Model | Tier | Quality | Speed |
|----------|-------|------|---------|-------|
| FAL.ai | MiniMax | Free | Good | Fast |
| Replicate | Wan-2.1 | Free | Good | Medium |
| PiAPI | Luma Dream | Paid | Excellent | Medium |

Automatic fallback: If primary provider fails, system tries the next in chain.

## 💾 Database Schema (Supabase)

### Tables

1. **users** - User accounts with subscription and usage tracking
2. **generations** - Video generation tasks and results
3. **api_keys** - Provider API keys with rotation
4. **webhook_logs** - Incoming webhook tracking
5. **user_sessions** - Session analytics
6. **app_events** - User interaction tracking

### Key Features

- Monthly usage reset (10 free clips)
- Referral code system
- Provider API key rotation
- Automatic stats updates via triggers

## ⚙️ Environment Variables

Set these in Vercel project settings:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key

# Provider API Keys
FAL_KEY=your-fal-api-key
REPLICATE_KEY=your-replicate-api-key
PIAPI_KEY=your-piapi-key
```

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 📱 Mobile App (Expo)

The `/app` directory contains an Expo React Native app with:
- Glassmorphism UI design
- Bottom tab navigation
- Supabase OAuth integration
- ASO-friendly app.json

## 🔄 Changelog

### v3.3.0 (Current)
- **FIXED:** Vercel timeout errors with async task pattern
- **NEW:** `/api/poll` endpoint for status polling
- **NEW:** Progress bar in frontend UI
- **IMPROVED:** Provider fallback reliability
- **IMPROVED:** Complete database schema with analytics

### v3.2.0
- Ultra-modern futuristic mobile design
- Supabase OAuth integration
- Enhanced database schema (40+ fields)
- Referral system

### v3.0.0
- Initial multi-provider architecture
- Free/Paid tier system
- Basic web interface

## 📊 Pricing

| Tier | Price | Clips/Month | Max Length | Quality |
|------|-------|-------------|------------|---------|
| Free | $0 | 10 | 10s | 768p |
| Basic | $4.99 | 120 | 15s | 1080p |
| Pro | $9.99 | 300 | 30s | 1080p |

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details.

---

Made with ❤️ by NeoClip AI
