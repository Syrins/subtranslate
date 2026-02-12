# SubTranslate

A full-stack web platform for **subtitle translation** and **video export** — upload a video, extract subtitles, translate them with AI, edit in a time-synced editor, and export the final video with burned-in or soft subtitles.

## Features

### Core Workflow
- **Upload** — Drag & drop video files (MP4, MKV, AVI, etc.) or subtitle files (SRT, ASS, SSA)
- **Extract** — Automatically extract embedded subtitle tracks from video files using FFmpeg
- **Translate** — AI-powered translation using OpenAI GPT-4, DeepL Pro, or Google Gemini
- **Edit** — Time-synced subtitle editor with live video preview and real-time subtitle overlay
- **Export** — Burn subtitles into video (hardcoded) or mux as soft-sub track

### Translation Engine
- **Multi-engine support** — OpenAI GPT-4 Turbo, DeepL Pro, Google Gemini 1.5 Pro
- **Smart chunking** — Automatically splits large subtitle files into optimal chunks with overlap for context continuity
- **Context-aware** — Passes previous lines as context for more natural translations
- **Glossary support** — User-defined term glossaries for consistent translations
- **User API keys** — Users can bring their own API keys or use system-level keys (plan-dependent)

### Video Export
- **Burn-in mode** — Hardcode subtitles into video with customizable styling (font, size, color, outline, shadow, position)
- **Soft-sub mode** — Mux subtitles as a separate track (no re-encoding)
- **Codec options** — H.264, H.265, VP9, AV1, or copy
- **Resolution scaling** — 480p, 720p, 1080p, 1440p, 4K
- **Watermark** — Optional text watermark overlay
- **Real-time progress** — FFmpeg progress tracking with percentage updates

### User Management
- **Authentication** — Email/password and Google OAuth via Supabase Auth
- **Subscription plans** — Free, Pro, Team tiers with different limits
- **Storage quotas** — Per-plan storage limits with automatic cleanup of oldest files
- **Daily job limits** — Rate limiting on translation/export jobs per day
- **File retention** — Automatic file expiry based on plan (1/3/7 days)
- **Admin panel** — Full admin dashboard for user management, job monitoring, engine configuration, system settings, and announcements

### Editor
- **Video player** — HTML5 video with HTTP Range request streaming
- **Time-synced subtitles** — Active subtitle highlighting synced to video playback
- **Auto-scroll** — Subtitle list auto-scrolls to the active line
- **Click-to-seek** — Click any subtitle line to jump to that timestamp
- **Inline editing** — Edit translated text directly in the subtitle list
- **Style customization** — Font family, size, color, outline, shadow, alignment, margin
- **SRT download** — Export translated subtitles as SRT file
- **Batch save** — Efficient batch update of edited subtitle lines

## Tech Stack

### Backend
| Technology | Purpose |
|-----------|---------|
| **FastAPI** | Web framework (async + sync endpoints) |
| **Python 3.12** | Runtime |
| **Uvicorn** | ASGI server (2 workers in production) |
| **Celery + Redis** | Background task queue (translation, cleanup, scheduled jobs) |
| **FFmpeg** | Video/audio processing (via `static-ffmpeg`) |
| **Supabase** | Database (PostgreSQL) + Authentication |
| **httpx** | Lightweight Supabase client (no SDK, direct REST API) |
| **Pydantic** | Request/response validation and settings management |
| **OpenAI / DeepL / Gemini** | AI translation engines |
| **pysubs2** | Subtitle file parsing (SRT, ASS, SSA, VTT) |
| **structlog** | Structured logging |

### Frontend
| Technology | Purpose |
|-----------|---------|
| **Next.js 16** | React framework (App Router, standalone output) |
| **React 19** | UI library |
| **TypeScript** | Type safety |
| **TailwindCSS v4** | Styling |
| **shadcn/ui** | Component library (Radix UI primitives) |
| **Supabase SSR** | Auth session management (cookies) |
| **Sonner** | Toast notifications |
| **Lucide** | Icon library |

### Infrastructure
| Technology | Purpose |
|-----------|---------|
| **Docker** | Containerization (multi-stage builds) |
| **Docker Compose** | Multi-service orchestration |
| **Redis 7** | Celery broker + result backend |
| **Coolify** | Self-hosted deployment platform |
| **Supabase** | Managed PostgreSQL + Auth + RLS |

## Project Structure

```
subtranslate/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app factory + file serving
│   │   ├── core/
│   │   │   ├── config.py           # Settings (pydantic-settings, env vars)
│   │   │   ├── supabase.py         # Lightweight Supabase client (httpx)
│   │   │   └── security.py         # JWT auth + admin guard
│   │   ├── api/routes/
│   │   │   ├── health.py           # GET /health (system status)
│   │   │   ├── projects.py         # CRUD, file upload, subtitle extraction
│   │   │   ├── translate.py        # Translation job creation + polling
│   │   │   ├── export.py           # Video export (burn-in / soft-sub)
│   │   │   ├── glossary.py         # User glossary terms CRUD
│   │   │   └── admin.py            # Admin panel endpoints
│   │   ├── services/
│   │   │   ├── storage.py          # Local file storage service
│   │   │   ├── cleanup.py          # File retention + storage limit enforcement
│   │   │   ├── subtitle_parser.py  # SRT/ASS parsing & writing
│   │   │   └── translation.py      # AI engine implementations
│   │   ├── workers/
│   │   │   ├── celery_app.py       # Celery config + beat schedule
│   │   │   └── tasks.py            # Background tasks
│   │   ├── models/
│   │   │   └── schemas.py          # Pydantic models
│   │   └── utils/
│   │       └── ffmpeg.py           # FFmpeg wrapper (probe, extract, burn, mux)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── run.py                      # Dev server runner
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (app)/              # Authenticated routes
│   │   │   │   ├── dashboard/      # Stats, recent projects
│   │   │   │   ├── upload/         # File upload + project creation
│   │   │   │   ├── translate/      # AI translation interface
│   │   │   │   ├── editor/         # Video player + subtitle editor
│   │   │   │   ├── export/         # Video export configuration
│   │   │   │   ├── projects/       # Project list + management
│   │   │   │   └── settings/       # Profile, API keys, storage config
│   │   │   ├── admin/              # Admin panel (users, jobs, engines)
│   │   │   ├── login/              # Authentication
│   │   │   └── register/           # Registration
│   │   ├── components/             # Reusable UI components (shadcn/ui)
│   │   ├── hooks/                  # Custom hooks (useAuth, useFetchOnFocus)
│   │   └── lib/
│   │       ├── api.ts              # Backend API client
│   │       ├── utils.ts            # Shared utilities
│   │       └── supabase/           # Supabase client (browser + server)
│   ├── Dockerfile
│   ├── next.config.ts
│   ├── package.json
│   └── .env.example
├── docker-compose.yml              # Full stack (Redis, backend, celery, frontend)
├── DEPLOY.md                       # Coolify deployment guide
└── .env.example                    # Root env vars for docker-compose
```

## Getting Started

### Prerequisites
- **Node.js 20+** (frontend)
- **Python 3.12+** (backend)
- **Redis** (for Celery task queue)
- **Supabase project** (database + auth)

### Local Development

#### 1. Clone the repository
```bash
git clone https://github.com/Syrins/subtranslate.git
cd subtranslate
```

#### 2. Backend setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac

pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Supabase keys, Redis URL, etc.

python run.py
```
Backend runs at `http://localhost:8000`. API docs at `/docs`.

#### 3. Frontend setup
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase URL and anon key

npm run dev
```
Frontend runs at `http://localhost:3000`.

#### 4. Celery worker (for background jobs)
```bash
cd backend
celery -A app.workers.celery_app worker --loglevel=info --concurrency=4
```

#### 5. Celery beat (for scheduled tasks)
```bash
cd backend
celery -A app.workers.celery_app beat --loglevel=info
```

### Docker (Local)
```bash
# Create .env in project root with required variables (see .env.example)
docker compose up --build
```

This starts all 5 services: Redis, backend, celery-worker, celery-beat, and frontend.

## Deployment

This project is designed for deployment with **[Coolify](https://coolify.io)** using Docker Compose.

See **[DEPLOY.md](./DEPLOY.md)** for the complete step-by-step Coolify deployment guide.

### Quick Overview
1. Add the GitHub repo as a Docker Compose resource in Coolify
2. Set environment variables in Coolify's UI (auto-detected from compose file)
3. Assign domains: `yourdomain.com` → frontend, `api.yourdomain.com` → backend
4. Deploy — Coolify builds and starts all services automatically

## API Endpoints

### Public
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | System health check |

### Projects (`/api/projects`)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List user's projects |
| `GET` | `/api/projects/{id}` | Get project details |
| `POST` | `/api/projects` | Create project (file upload) |
| `POST` | `/api/projects/subtitle` | Create project from subtitle file |
| `POST` | `/api/projects/url` | Create project from URL |
| `DELETE` | `/api/projects/{id}` | Delete project |
| `GET` | `/api/projects/{id}/subtitles` | Get subtitle lines |
| `PATCH` | `/api/projects/{id}/subtitles/batch` | Batch update subtitle lines |
| `GET` | `/api/projects/{id}/subtitles/export` | Export SRT file |
| `GET` | `/api/projects/storage-info` | Get user storage info |

### Translation (`/api/translate`)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/translate` | Create translation job |
| `GET` | `/api/translate/{id}` | Get job status |
| `POST` | `/api/translate/{id}/cancel` | Cancel job |

### Export (`/api/export`)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/export` | Create export job |
| `GET` | `/api/export/{id}` | Get job status |
| `GET` | `/api/export/{id}/download` | Get download URL |
| `POST` | `/api/export/{id}/cancel` | Cancel job |

### Glossary (`/api/glossary`)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/glossary` | List glossary terms |
| `POST` | `/api/glossary` | Add term |
| `DELETE` | `/api/glossary/{id}` | Delete term |

### Admin (`/api/admin`)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/stats` | System statistics |
| `GET` | `/api/admin/users` | List users |
| `PATCH` | `/api/admin/users/{id}` | Update user |
| `DELETE` | `/api/admin/users/{id}` | Delete user |
| `GET` | `/api/admin/jobs` | List all jobs |
| `POST` | `/api/admin/jobs/{id}/cancel` | Cancel job |
| `POST` | `/api/admin/jobs/{id}/retry` | Retry failed job |
| `GET` | `/api/admin/engines` | List engines |
| `PATCH` | `/api/admin/engines/{id}` | Update engine |
| `GET` | `/api/admin/settings` | Get system settings |
| `PATCH` | `/api/admin/settings` | Update settings |
| `GET` | `/api/admin/storage` | Storage statistics |
| `POST` | `/api/admin/storage/cleanup` | Trigger cleanup |

## Database Schema

The application uses **Supabase** (PostgreSQL) with the following main tables:

- `profiles` — User profiles (linked to Supabase Auth)
- `subscription_plans` — Plan definitions (free, pro, team)
- `projects` — User projects (video/subtitle files)
- `subtitle_files` — Extracted subtitle tracks per project
- `translation_jobs` — Translation job tracking
- `export_jobs` — Export job tracking
- `stored_files` — File storage tracking (with retention/expiry)
- `glossary_terms` — User translation glossaries
- `translation_engines` — Engine configuration
- `user_api_keys` — User's own API keys (encrypted)
- `user_storage_configs` — User's external storage (R2/B2)
- `system_settings` — System-wide key-value settings
- `announcements` — Admin announcements
- `user_preferences` — User notification/UI preferences

## Environment Variables

### Backend
| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `REDIS_URL` | Yes | Redis connection URL |
| `CORS_ORIGINS` | Yes | Allowed CORS origins (comma-separated) |
| `STORAGE_DIR` | No | Local file storage path (default: `./storage`) |
| `TEMP_DIR` | No | Temp directory for processing (default: `./tmp`) |
| `DEBUG` | No | Enable debug mode (default: `false`) |
| `OPENAI_API_KEY` | No | System-level OpenAI key |
| `DEEPL_API_KEY` | No | System-level DeepL key |
| `GEMINI_API_KEY` | No | System-level Gemini key |

### Frontend
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL |

## License

This project is proprietary software. All rights reserved.
