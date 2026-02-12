# SubTranslate Backend

FastAPI backend for subtitle translation & video export.

## Quick Start

```bash
# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Copy env file and fill in values
cp .env.example .env

# Run development server
python run.py
```

## API Docs

After starting the server, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Docker

```bash
# From project root
docker-compose up -d
```

## Architecture

```
backend/
├── app/
│   ├── main.py              # FastAPI app factory
│   ├── core/
│   │   ├── config.py         # Settings (env vars)
│   │   ├── supabase.py       # Supabase client (admin + user)
│   │   └── security.py       # JWT auth + admin guard
│   ├── api/routes/
│   │   ├── health.py         # GET /health
│   │   ├── projects.py       # CRUD + file upload + subtitle extraction
│   │   ├── translate.py      # Translation jobs (OpenAI/DeepL/Gemini)
│   │   ├── export.py         # Video export (burn-in / soft-sub)
│   │   ├── glossary.py       # User glossary terms
│   │   └── admin.py          # Admin endpoints (users, jobs, engines, settings)
│   ├── services/
│   │   ├── subtitle_parser.py # SRT/ASS parsing & writing
│   │   └── translation.py    # AI translation engines
│   ├── workers/
│   │   ├── celery_app.py     # Celery configuration
│   │   └── tasks.py          # Background tasks (translate, export)
│   ├── models/
│   │   └── schemas.py        # Pydantic request/response models
│   └── utils/
│       └── ffmpeg.py         # FFmpeg wrapper (probe, extract, burn, mux)
├── requirements.txt
├── Dockerfile
├── run.py
└── .env.example
```
