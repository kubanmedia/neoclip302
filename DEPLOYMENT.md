# Deployment Guide - NeoClip 302

Complete step-by-step guide to deploy NeoClip to Vercel.

## Prerequisites

- Node.js 18+ installed
- Git installed
- Vercel account (free tier works)
- Supabase account (free tier works)
- PiAPI account (50 free gens/day)
- FAL.ai account (paid, $0.018/gen)

---

## Step 1: Set Up Supabase Database

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Enter:
   - **Name**: neoclip302
   - **Database Password**: (generate strong password)
   - **Region**: Choose closest to your users
4. Click "Create new project"

### 1.2 Run Database Schema

1. Go to **SQL Editor** in left sidebar
2. Click **New Query**
3. Open `supabase/schema.sql` from this repo
4. Copy all SQL code
5. Paste into SQL Editor
6. Click **Run** (bottom right)
7. Verify success: Check "Tables" tab - should see `users`, `generations`, etc.

### 1.3 Get API Credentials

1. Go to **Settings** → **API**
2. Copy:
   - **Project URL** → Save as `SUPABASE_URL`
   - **service_role** key (NOT anon!) → Save as `SUPABASE_KEY`

⚠️ **Important**: Use the `service_role` key, NOT the `anon` key!

---

## Step 2: Get Video Generation API Keys

### 2.1 PiAPI (Free Tier)

1. Go to [piapi.ai](https://piapi.ai)
2. Sign up for free account
3. Go to **Dashboard** → **API Keys**
4. Click **Create New Key**
5. Copy key → Save as `PIAPI_KEY`

**Pro Tip**: Create 3 accounts with different emails for 150 free gens/day!

### 2.2 FAL.ai (Paid Tier)

1. Go to [fal.ai](https://fal.ai)
2. Sign up
3. Go to **Dashboard** → **API Keys**
4. Click **Create Key**
5. Copy key → Save as `FAL_KEY`

---

## Step 3: Deploy to Vercel

### Option A: Via Vercel Dashboard (Easiest)

#### 3.1 Import Repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select **GitHub**
4. Find and select `kubanmedia/neoclip302`
5. Click **Import**

#### 3.2 Configure Project

1. **Project Name**: Keep `neoclip302` or customize
2. **Framework Preset**: Vite (auto-detected)
3. **Root Directory**: `./` (default)
4. **Build Command**: `npm run build` (default)
5. **Output Directory**: `dist` (default)

#### 3.3 Add Environment Variables

Click **Environment Variables** section, then add:

| Name | Value | Notes |
|------|-------|-------|
| `PIAPI_KEY` | `sk-xxxxx` | From PiAPI dashboard |
| `FAL_KEY` | `xxxxx` | From FAL.ai dashboard |
| `SUPABASE_URL` | `https://xxx.supabase.co` | From Supabase Settings > API |
| `SUPABASE_KEY` | `eyJxxx...` | Service role key |

**Environment Selection**: Select **Production, Preview, Development** for all

#### 3.4 Deploy

1. Click **Deploy**
2. Wait 1-2 minutes
3. Get your URL: `https://neoclip302.vercel.app`

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Add environment variables
vercel env add PIAPI_KEY production
# Paste your key when prompted
# Repeat for: FAL_KEY, SUPABASE_URL, SUPABASE_KEY

# Deploy
cd neoclip302
vercel --prod
```

---

## Step 4: Verify Deployment

### 4.1 Test Frontend

1. Open `https://your-project.vercel.app`
2. Should see NeoClip homepage
3. Check browser console for errors

### 4.2 Test API Endpoints

```bash
# Replace with your Vercel URL
export VERCEL_URL="https://neoclip302.vercel.app"

# Test user creation
curl -X POST $VERCEL_URL/api/user \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test-device-123"}'

# Expected: {"success":true,"user":{...}}

# Save the user ID from response
export USER_ID="xxx-xxx-xxx"

# Test video generation (uses free quota!)
curl -X POST $VERCEL_URL/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A sunset over mountains",
    "userId": "'$USER_ID'",
    "tier": "free",
    "length": 10
  }'

# Expected: Video generation starts, returns videoUrl after ~60 seconds
```

### 4.3 Check Logs

1. Go to Vercel Dashboard
2. Select your project
3. Click **Functions** tab
4. Click on any function (e.g., `generate.js`)
5. View logs for errors

---

## Step 5: Configure Domain (Optional)

### 5.1 Custom Domain

1. Go to Vercel Project → **Settings** → **Domains**
2. Enter your domain (e.g., `neoclip.app`)
3. Follow DNS setup instructions
4. Wait for SSL certificate (automatic)

### 5.2 Update Frontend

If using custom domain, update `main.js`:

```javascript
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://your-custom-domain.com';
```

Then redeploy:

```bash
git add main.js
git commit -m "Update API URL"
git push origin main
```

Vercel auto-deploys on push!

---

## Step 6: Monitor & Scale

### 6.1 Check Usage

**Vercel**:
- Dashboard → Analytics
- Free tier: 500k function invocations/month

**Supabase**:
- Dashboard → Database → Usage
- Free tier: 500MB database, 50k auth

**PiAPI**:
- Dashboard → Usage
- Free tier: 50 gens/day per account

### 6.2 When to Upgrade

| Service | Free Limit | Upgrade Cost |
|---------|------------|--------------|
| Vercel | 500k calls/mo | $20/mo (Pro) |
| Supabase | 500MB DB | $25/mo (Pro) |
| PiAPI | 50 gens/day | Rotate accounts |

---

## Troubleshooting

### "Missing environment variables"

**Solution**:
1. Go to Vercel Dashboard → Settings → Environment Variables
2. Verify all 4 variables are set
3. Click **Redeploy** in Deployments tab

### "User not found" errors

**Solution**:
1. Check Supabase SQL Editor
2. Run this query: `SELECT * FROM users LIMIT 5;`
3. If empty, schema wasn't applied
4. Re-run `supabase/schema.sql`

### "CORS errors" in browser

**Solution**:
1. Check `vercel.json` has correct CORS headers
2. Ensure API URL has no trailing slash
3. Clear browser cache

### Video generation timeout

**Solution**:
- PiAPI can take 60-120 seconds
- Check PiAPI dashboard for quota
- Verify PIAPI_KEY is correct

### "Rate limit exceeded"

**Solution**:
1. PiAPI has 50 gens/day limit
2. Create additional accounts
3. Rotate API keys in code
4. Or upgrade to paid tier

---

## Production Checklist

Before going live, verify:

- ✅ All environment variables set
- ✅ Database schema applied
- ✅ Test user can generate video
- ✅ Error handling works (try with invalid prompt)
- ✅ Free tier quota limits enforced
- ✅ Video playback works on mobile
- ✅ Analytics/monitoring enabled
- ✅ Backup strategy for database
- ✅ Rate limiting in place
- ✅ Security headers configured

---

## Rollback Procedure

If deployment fails:

1. **Via Vercel Dashboard**:
   - Go to **Deployments**
   - Find last working deployment
   - Click **···** → **Promote to Production**

2. **Via CLI**:
   ```bash
   vercel rollback
   ```

---

## Support

- **GitHub Issues**: [github.com/kubanmedia/neoclip302/issues](https://github.com/kubanmedia/neoclip302/issues)
- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)

---

**Deployment complete! 🚀**

Your NeoClip instance should now be live at `https://neoclip302.vercel.app`
