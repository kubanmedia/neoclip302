# NeoClip Production

**AI video generator**

Generate 10-second viral shorts for FREE, 30-second HD clips for Pro users.


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


### GET `/api/status`
Check generation status or user info.


## 📄 License

MIT License - see LICENSE file for details.

---

**Made with ❤️ by NeoClip AI**

"Generate 10 viral shorts before your coffee is ready – no credit card, no watermark, no export limit."
