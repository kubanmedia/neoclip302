# NeoClip 302 - AI Video Generator

**Zero-cost, profitable-from-day-1 AI video generator**

🎬 Generate 10-second viral shorts for FREE | 30-second HD clips for Pro users

🌐 **Live Demo**: https://neoclip302.vercel.app

## Features

- 🆓 **Free Tier**: 10 clips/month at 768p resolution
- ⭐ **Pro Tier**: Unlimited HD 1080p clips up to 30 seconds
- 🚀 **Fast**: Vite-powered frontend, edge-deployed backend
- 🔒 **Secure**: All API keys in Vercel Environment Variables
- 📱 **Responsive**: Works on desktop and mobile
- 🎨 **Modern UI**: Dark theme with smooth animations

## Tech Stack

### Frontend
- **Vite** - Lightning-fast build tool
- **Vanilla JS** - No framework overhead
- **Modern CSS** - Dark theme with animations

### Backend
- **Vercel Serverless Functions** - Zero-cost API hosting
- **Supabase** - PostgreSQL database with RLS
- **PiAPI** - Free tier video generation (Hailuo-02)
- **FAL.ai** - Pro tier video generation (Kling 2.5)

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/kubanmedia/neoclip302.git
cd neoclip302
npm install
```

### 2. Set Up Environment Variables

Add these in **Vercel Dashboard > Settings > Environment Variables**:

| Variable | Description | Get From |
|----------|-------------|----------|
| `PIAPI_KEY` | PiAPI key for free tier | [piapi.ai/dashboard](https://piapi.ai) |
| `FAL_KEY` | FAL.ai key for paid tier | [fal.ai/dashboard](https://fal.ai) |
| `SUPABASE_URL` | Supabase project URL | [supabase.com](https://supabase.com) |
| `SUPABASE_KEY` | Supabase service role key | Project Settings > API |

### 3. Set Up Database

1. Create a free Supabase project
2. Go to SQL Editor
3. Copy and run `supabase/schema.sql`

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or use the Vercel Dashboard:
1. Import repository
2. Add environment variables
3. Click Deploy

## Local Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
neoclip302/
├── api/                    # Vercel serverless functions
│   ├── generate.js         # Video generation
│   ├── status.js           # Status check
│   ├── user.js             # User management
│   └── webhook.js          # Webhook handler
├── supabase/
│   └── schema.sql          # Database schema
├── index.html              # Main HTML
├── main.js                 # Application logic
├── style.css               # Styles
├── vite.config.js          # Vite configuration
├── vercel.json             # Vercel configuration
└── package.json            # Dependencies
```

## API Endpoints

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

### GET `/api/status?userId=xxx`
Get user status and recent generations.

### POST `/api/user`
Create or get user by device ID.

### POST `/api/webhook`
Receive callbacks from video generation APIs.

## Pricing Tiers

| Tier | Price | Clips/Mo | Max Length | Quality | Ads |
|------|-------|----------|------------|---------|-----|
| Free | $0 | 10 | 10s | 768p | Yes |
| Pro | $4.99 | Unlimited | 30s | 1080p | No |

## Security

### CVE-2025-55182 Status: NOT AFFECTED ✅

This project uses Vercel Serverless Functions (NOT Next.js with React Server Components), so it is not affected by CVE-2025-55182.

### Security Features
- ✅ All API keys in Vercel Environment Variables
- ✅ No hardcoded secrets
- ✅ Input validation on all endpoints
- ✅ Row Level Security (RLS) in Supabase
- ✅ CORS properly configured

See [SECURITY.md](SECURITY.md) for details.

## Troubleshooting

### "Missing environment variables"
- Ensure all env vars are set in Vercel Dashboard
- Redeploy after adding variables

### "User not found"
- Run the database schema in Supabase
- Check SUPABASE_URL and SUPABASE_KEY

### CORS errors
- Check vercel.json headers configuration
- Ensure API URL matches (no trailing slash)

### Video generation timeout
- PiAPI/FAL might be slow
- Wait 2-3 minutes for completion

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **GitHub Issues**: [github.com/kubanmedia/neoclip302/issues](https://github.com/kubanmedia/neoclip302/issues)
- **Live Demo**: [neoclip302.vercel.app](https://neoclip302.vercel.app)

---

**Made with ❤️ by NeoClip AI**

*"Generate 10 viral shorts before your coffee is ready – no credit card, no watermark, no export limit."*
