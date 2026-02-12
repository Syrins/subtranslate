# SubTranslate — Coolify Deployment Guide

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│  Backend    │────▶│   Redis     │
│  (Next.js)  │     │  (FastAPI)  │     │  (7-alpine) │
│  :3000      │     │  :8000      │     │  :6379      │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │ Celery      │
                    │ Worker (x4) │
                    │ + Beat      │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Supabase │ │ Local    │ │ AI APIs  │
        │ (DB+Auth)│ │ Storage  │ │ (OpenAI) │
        └──────────┘ └──────────┘ └──────────┘
```

## Coolify Deployment (Docker Compose)

### 1. Create a New Resource in Coolify
- Open your Coolify dashboard → Project → **Create New Resource**
- Choose **Public Repository** (or GitHub App for private)
- Paste: `https://github.com/Syrins/subtranslate`

### 2. Select Build Pack
- Click the Nixpacks option → select **Docker Compose**
- **Base Directory**: `/`
- **Docker Compose Location**: `/docker-compose.yml`

### 3. Set Environment Variables
After Coolify loads the compose file, it will detect all `${VAR}` references and show them in the UI. Required variables (marked with `:?`) will have a **red border** if empty.

Fill in the following in Coolify's Environment Variables panel:

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (backend only) |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |
| `CORS_ORIGINS` | ✅ | Frontend domain (e.g. `https://yourdomain.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Same as SUPABASE_URL (for frontend build) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Same as SUPABASE_ANON_KEY (for frontend build) |
| `NEXT_PUBLIC_API_URL` | ✅ | Backend URL (e.g. `https://api.yourdomain.com`) |
| `R2_ACCESS_KEY_ID` | ❌ | Cloudflare R2 access key (optional) |
| `R2_SECRET_ACCESS_KEY` | ❌ | Cloudflare R2 secret key (optional) |
| `R2_ENDPOINT` | ❌ | R2 endpoint URL |
| `R2_BUCKET_NAME` | ❌ | R2 bucket name (default: `subtranslate`) |
| `R2_CDN_DOMAIN` | ❌ | CDN domain for R2 |
| `OPENAI_API_KEY` | ❌ | System-level OpenAI key |
| `DEEPL_API_KEY` | ❌ | System-level DeepL key |
| `GEMINI_API_KEY` | ❌ | System-level Gemini key |
| `DEBUG` | ❌ | `true` or `false` (default: `false`) |

> **Note:** `REDIS_URL`, `STORAGE_DIR`, and `TEMP_DIR` are hardcoded in the compose file — no need to set them manually.

### 4. Assign Domains
In Coolify's service list, assign domains to the public-facing services:

- **frontend** → `https://yourdomain.com:3000`
- **backend** → `https://api.yourdomain.com:8000`

> The `:3000` and `:8000` tell Coolify which container port to route to. The proxy will serve them on standard ports (80/443).

**Do NOT assign domains to:** `redis`, `celery-worker`, `celery-beat` — these are internal services.

### 5. Deploy
Click **Deploy** — Coolify will:
1. Build the backend Docker image (Python + FFmpeg)
2. Build the frontend Docker image (Next.js standalone)
3. Start Redis
4. Start backend (waits for Redis health check)
5. Start celery-worker and celery-beat (excluded from health checks)
6. Start frontend (waits for backend health check)

---

## Important Notes

### Persistent Storage
The `backend_storage` volume stores all uploaded videos and subtitle files.
**Do NOT delete this volume** — it contains user data.

### CORS
`CORS_ORIGINS` must include your frontend domain. Multiple origins supported:
```
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### HTTPS / SSL
Coolify handles SSL/TLS automatically via Let's Encrypt.
Make sure your DNS A records point to the Coolify server IP.

### Supabase
- Supabase is external (hosted on supabase.co) — not self-hosted
- Make sure the Supabase URL and keys are correct
- Required tables and RPC functions must exist (see database migrations)

### Health Checks
- **Backend**: `GET /health` — returns JSON with service status
- **Frontend**: `GET /` — returns 200
- **Redis**: `redis-cli ping`
- **Celery Worker/Beat**: excluded from health checks (`exclude_from_hc: true`)

### Scaling
- Celery worker concurrency: adjust `--concurrency=4` based on server CPU cores
- Backend workers: adjust `--workers 2` in `backend/Dockerfile` CMD
- Redis maxmemory: adjust `--maxmemory 256mb` in docker-compose

### Local Development
For local development without Coolify, create a `.env` file in the project root with the required variables, then:
```bash
docker compose up --build
```
The services will be available at `http://localhost:8000` (backend) and `http://localhost:3000` (frontend) via the container ports.
