# 🎬 NeoClip AI v3.2.0

> **Generate viral short videos with AI in seconds!**  
> 10 FREE clips per month • No credit card needed

[![Live Demo](https://img.shields.io/badge/Live-Demo-00D9FF?style=for-the-badge)](https://neoclip302.vercel.app)

## 🚀 Features

- **AI Video Generation** - Create stunning videos from text prompts
- **Multi-Provider Fallback** - Wan-2.1, Pika-2.2, MiniMax, Luma Dream
- **Modern Glassmorphism UI** - Futuristic design with neon effects
- **Supabase OAuth** - Google, Apple, Email authentication
- **Full User Data Collection** - Analytics-ready user profiles

## 💰 Pricing

| Tier | Price | Clips/Month | Max Length | Resolution |
|------|-------|-------------|------------|------------|
| Free | $0 | 10 | 10s | 768p |
| Basic | $4.99/mo | 120 | 15s | 1080p |
| Pro | $9.99/mo | 300 | 30s | 1080p |

## 🏗️ Structure

```
neoclip302/
├── api/                # Vercel Serverless Functions
│   ├── generate.js     # Video generation API
│   ├── user.js         # User management with OAuth
│   ├── status.js       # Generation status
│   └── debug.js        # Debug endpoint
├── app/                # Expo React Native App
│   ├── App.js          # Main application
│   ├── app.json        # ASO configuration
│   └── package.json    # Dependencies
├── supabase/
│   └── schema.sql      # Full database schema
├── dist/               # Vite build output
├── package.json        # Web dependencies
└── vercel.json         # Deployment config
```

## 🌐 URLs

- **Web App**: https://neoclip302.vercel.app
- **GitHub**: https://github.com/kubanmedia/neoclip302

## 📊 Database

### Supabase PostgreSQL Tables
- **users** - OAuth profiles with 40+ fields
- **generations** - Video generation records
- **api_keys** - Provider key rotation
- **webhook_logs** - Provider webhooks
- **user_sessions** - Session analytics
- **app_events** - Event tracking

## 🚀 Deployment

### Environment Variables
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
REPLICATE_KEY=r8_xxxxxxxxxxxx
FAL_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PIAPI_KEY=xxxxxxxxxxxxxxxx
```

### Deploy Steps
1. Fork this repository
2. Connect to Vercel
3. Add environment variables
4. Run `supabase/schema.sql` in Supabase
5. Deploy!

### Mobile App
```bash
cd app
npm install
npx expo start
```

## 💡 Cost-Effective Provider Chain

| Priority | Provider | Cost/10s |
|----------|----------|----------|
| 1st | Wan-2.1 (Replicate) | $0.0008 |
| 2nd | MiniMax (FAL) | Free |
| 3rd | Pika 2.2 (FAL) | Free |
| 4th | Luma Dream (PiAPI) | $0.20 |

**Made with ❤️ by NeoClip AI**
