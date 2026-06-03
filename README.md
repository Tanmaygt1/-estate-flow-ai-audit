# Estate Flow AI v2 — AI Growth Audit

Premium AI-powered business audit for reel-driven lead generation.
Paper, Ink & Glass aesthetic · Google OAuth · Email delivery · Audit history · PDF export.

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Set up env
cp .env.local.example .env.local
# Fill in all values

# 3. Run Supabase SQL
# Paste supabase_schema.sql into Supabase SQL Editor → Run

# 4. Dev
npm run dev
# → http://localhost:3000

# 5. Deploy
npx vercel --prod
```

---

## 7 Environment Variables

| Variable | Source |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (secret key) |
| `XAI_API_KEY` | https://console.x.ai |
| `SMTP_USER` | Your Gmail address |
| `SMTP_PASS` | Gmail App Password (16 chars) |
| `MASTER_EMAIL` | Your admin email for audit copies |

---

## Gmail App Password Setup

1. Google Account → Security → 2-Step Verification (enable if not on)
2. Security → App Passwords → Select app: Mail → Generate
3. Copy the 16-character password → `SMTP_PASS`

---

## Project Structure

```
estate-flow-v2/
├── app/
│   ├── page.js
│   ├── layout.js
│   └── api/
│       ├── analyze/route.js     ← Grok AI generation
│       ├── capture/route.js     ← Supabase save
│       ├── email/route.js       ← Nodemailer (user + master)
│       └── audits/route.js      ← Audit history fetch
├── components/
│   └── App.js                   ← Full frontend (single file)
├── supabase_schema.sql
└── .env.local.example
```

---

## Flow

1. **Landing** → Reel-focused hero
2. **Form** → 5 sections, 25+ questions (region sets currency automatically)
3. **Auth modal** → Google OAuth or manual — form data preserved, never lost
4. **Analyzing** → 5-step animated screen
5. **Report** → Premium glassmorphism report with PDF export
6. **Email** → Sent to user + master email automatically
7. **History** → All past audits accessible from nav
"# -estate-flow-ai-audit" 
