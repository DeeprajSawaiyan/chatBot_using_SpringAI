# Deployment (free tier)

Deploy **backend** and **frontend** on [Render](https://render.com) (free plan). Groq API has a free tier for the LLM.

## Cost

| Service | Provider | Cost |
|---------|----------|------|
| Backend (Spring Boot) | Render Web Service | $0 (free tier) |
| Frontend (React) | Render Static Site | $0 |
| LLM API | [Groq](https://console.groq.com/) | $0 free tier limits |

**Note:** Render free web services spin down after ~15 minutes of inactivity. The first request after sleep may take 30–60 seconds (cold start).

## Prerequisites

1. GitHub account and this repo pushed to GitHub
2. [Render](https://render.com) account (sign up with GitHub)
3. Groq API key from [console.groq.com](https://console.groq.com/) → API keys

**Security:** If your API key was ever committed to git, rotate it in the Groq console before deploying.

## One-click deploy (recommended)

1. Push this repository to GitHub.
2. Open [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.
3. Connect your GitHub repo and select this project.
4. Render reads `render.yaml` and creates two services: `chatbot-api` and `chatbot-ui`.
5. When prompted, set **`GROQ_API_KEY`** to your Groq secret (`gsk_...`).
6. Click **Apply**. Wait for both services to finish building (backend ~5–10 min first time).
7. Open the **`chatbot-ui`** service URL (e.g. `https://chatbot-ui-xxxx.onrender.com`).

The UI is automatically wired to the API via `REACT_APP_API_BASE_URL`.

## Manual env vars (if needed)

On the **chatbot-api** service in Render → **Environment**:

| Key | Value |
|-----|--------|
| `GROQ_API_KEY` | Your Groq API key |

On **chatbot-ui** (usually set by blueprint):

| Key | Value |
|-----|--------|
| `REACT_APP_API_BASE_URL` | `https://chatbot-api-xxxx.onrender.com` (your API URL, no trailing slash) |

## Verify

- API health: `https://<chatbot-api-url>/health` → `{"status":"ok"}`
- Chat: open the UI URL and send a message

## Local production build test

```bash
# Backend
export GROQ_API_KEY="gsk_..."
cd spring-boot-ai-chatbot
mvn spring-boot:run

# Frontend (separate terminal)
cd chatbot-ui
REACT_APP_API_BASE_URL=http://localhost:8080 npm run build
npx serve -s build
```

## Alternative: Vercel (frontend only)

1. Deploy **chatbot-api** on Render as above.
2. Import `chatbot-ui` folder to [Vercel](https://vercel.com).
3. Set env `REACT_APP_API_BASE_URL` = your Render API URL.
4. Deploy. CORS already allows `*.vercel.app`.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| UI cannot reach API | Check `REACT_APP_API_BASE_URL` on UI service; redeploy UI after changing it |
| 503 / API key errors | Set `GROQ_API_KEY` on **chatbot-api** and redeploy |
| Slow first message | Normal on Render free tier (cold start); wait and retry |
| CORS errors | Ensure UI URL matches `*.onrender.com` or add your domain in `WebConfig.java` |
