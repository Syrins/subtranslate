# SubTranslate

Full-stack subtitle translation and video export platform.

Altyazi cevirisi ve video export icin gelistirilmis full-stack platform.

## Features

- Video/subtitle file upload with drag-and-drop
- Automatic subtitle track extraction (SRT, ASS, SSA, VTT)
- AI-powered translation (OpenAI, Gemini, OpenRouter, DeepL)
- Real-time subtitle editor with video preview
- Burn-in or soft-sub export with custom styling
- Quality upscale support (Lanczos, up to 2x)
- External storage integration (Cloudflare R2, Backblaze B2)
- User plan/quota management with admin panel
- Glossary support for consistent translations

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React 19, TailwindCSS 4, shadcn/ui |
| **Backend** | FastAPI, Python 3.12, Uvicorn |
| **Worker** | Celery 5, Redis 7 |
| **Database** | Supabase (PostgreSQL + Auth + RLS) |
| **Media** | FFmpeg (static binaries) |
| **Storage** | Cloudflare R2 / Backblaze B2 (S3-compatible) |
| **Deploy** | Docker Compose + Coolify |

## Architecture

```
Frontend (Next.js :3000)
    |
Backend API (FastAPI :8000)
    |
    +-- Supabase (DB + Auth)
    +-- Redis (job queue)
    +-- Celery Worker (FFmpeg, AI translation)
    +-- Celery Beat (scheduled cleanup)
    +-- R2/B2 Storage (files)
```

## Quick Start (Local Development)

```powershell
# Start all services (backend, frontend, celery, redis)
.\start.ps1

# Stop all services
.\stop.ps1
```

Backend: http://localhost:8000 | Frontend: http://localhost:3000

## Deployment (Coolify + Docker Compose)

1. Connect repo in Coolify, select **Docker Compose** build pack
2. Set environment variables in Coolify UI (auto-detected from `docker-compose.yml`)
3. Assign domains: frontend + backend
4. Deploy

See [Deploy Guide (TR)](docs/tr/deploy/README.md) | [Deploy Guide (EN)](docs/en/deploy/README.md)

### Resource Limits (for 24-core / 64GB machine)

| Service | CPU | RAM | Notes |
|---|---|---|---|
| Redis | - | 1G | Internal, auto-password via Coolify |
| Backend | 3 | 4G | 2 uvicorn workers |
| Celery Worker | 6 | 16G | concurrency=2, FFmpeg 6 threads/task |
| Celery Beat | 0.5 | 256M | Scheduler only |
| Frontend | 2 | 2G | Next.js standalone |

### Environment Files

| File | Purpose |
|---|---|
| `.env` | Production (Coolify) |
| `.env.local` | Local development |
| `.env.example` | Template with documentation |
| `backend/.env` | Backend-only local dev |

## Documentation

- [Docs Hub](docs/README.md)
- [TR Deploy Guide](docs/tr/deploy/README.md) | [EN Deploy Guide](docs/en/deploy/README.md)
- [TR Backend Docs](docs/tr/backend/README.md) | [EN Backend Docs](docs/en/backend/README.md)
- [TR Frontend Docs](docs/tr/frontend/README.md) | [EN Frontend Docs](docs/en/frontend/README.md)
- [TR Engine Docs](docs/tr/engine/README.md) | [EN Engine Docs](docs/en/engine/README.md)
- [TR Troubleshooting](docs/tr/HATA_GIDERME.md) | [EN Troubleshooting](docs/en/TROUBLESHOOTING.md)

## Repository

GitHub: [https://github.com/Syrins/subtranslate/](https://github.com/Syrins/subtranslate/)
