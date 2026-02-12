# Backend Documentation (EN)

This document explains backend architecture, runtime model, API groups, and operational behavior for `backend/`.

## 1. Overview

The backend is a FastAPI API layer responsible for:
- authentication and authorization
- project and file lifecycle
- subtitle parsing/editing
- translation and export job orchestration
- admin operations
- health checks

Long-running operations are not executed inside request threads. They are dispatched to Celery workers.

## 2. Service Topology

Runtime components:
- FastAPI (`backend` service)
- Celery Worker (`celery-worker`)
- Celery Beat (`celery-beat`)
- Redis (broker + result backend)
- Supabase (db + auth)
- Local storage volume (`/app/storage`)

Request flow:
1. Frontend calls API.
2. API creates a job record.
3. API dispatches a Celery task with `delay()`.
4. Worker processes the task and updates Supabase status/progress.
5. Frontend polls job status endpoints.

## 3. Code Layout

Main locations:
- `backend/app/main.py`: app factory, middleware, route registration, file serving
- `backend/app/core/`: config, security, supabase client
- `backend/app/api/routes/`: HTTP endpoints
- `backend/app/services/`: storage, cleanup, subtitle parser, translation engines
- `backend/app/workers/`: celery config and tasks
- `backend/app/models/schemas.py`: pydantic schemas
- `backend/app/utils/ffmpeg.py`: ffmpeg wrappers

## 4. Configuration and Environment

Configuration is managed by `Settings` in `backend/app/core/config.py`.

Critical env vars:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `REDIS_URL`
- `CORS_ORIGINS`
- `STORAGE_DIR`
- `TEMP_DIR`
- `OPENAI_API_KEY`
- `DEEPL_API_KEY`
- `GEMINI_API_KEY`

Notes:
- In Compose, `REDIS_URL` is injected as `redis://redis:6379/0`.
- `TEMP_DIR` and `STORAGE_DIR` are container paths.

## 5. Auth and Authorization Model

Auth behavior:
- Token is read from `HTTPBearer`.
- Token is validated against Supabase Auth API.
- Profile is loaded from `profiles`.

Access levels:
- regular user endpoints use `get_current_user`
- admin endpoints use `require_admin`

The `/api/admin/*` router is protected with router-level admin dependency.

## 6. API Groups

### 6.1 Health
- `GET /health`
- Returns FFmpeg, Redis, Supabase, storage status.

### 6.2 Projects (`/api/projects`)
- `GET /api/projects`
- `GET /api/projects/storage/info`
- `GET /api/projects/{project_id}`
- `POST /api/projects` (video upload)
- `POST /api/projects/subtitle` (subtitle upload)
- `DELETE /api/projects/{project_id}`
- `GET /api/projects/{project_id}/tracks`
- `GET /api/projects/{project_id}/subtitles`
- `PATCH /api/projects/{project_id}/subtitles/batch`
- `GET /api/projects/{project_id}/export-srt`

### 6.3 Translation (`/api/translate`)
- `POST /api/translate`
- `GET /api/translate/{job_id}`
- `POST /api/translate/{job_id}/cancel`
- `GET /api/translate/history/{project_id}`

### 6.4 Export (`/api/export`)
- `POST /api/export`
- `GET /api/export/{job_id}`
- `GET /api/export/{job_id}/download`
- `POST /api/export/{job_id}/cancel`
- `POST /api/export/{project_id}/uploaded-to-own-storage`

### 6.5 Glossary (`/api/glossary`)
- `GET /api/glossary`
- `POST /api/glossary`
- `DELETE /api/glossary/{term_id}`

### 6.6 Admin (`/api/admin`)
- stats, users, jobs, engines, settings, announcements, storage endpoints
- job cancel/retry endpoints are queue-based

## 7. Queue and Worker Model

API dispatches:
- translation: `run_translation_task.delay(...)`
- export: `run_export_task.delay(...)`
- project video processing: `run_project_processing_task.delay(...)`

Worker tasks:
- `run_translation_task`
- `run_export_task`
- `run_project_processing_task`
- `cleanup_expired_files_task` (beat)
- `reset_monthly_usage` (beat)

Cancel behavior:
- Worker checks `cancelled` status and exits gracefully.
- Export has an additional post-encode cancellation check.

## 8. Storage and File Lifecycle

Storage implementation:
- `backend/app/services/storage.py`
- Local filesystem root under `/app/storage`

Security:
- path traversal checks via `relative_to` boundary checks
- `/files/{path}` route validates root boundary before reading

Cleanup:
- `cleanup.py` handles retention and quota cleanup
- active project statuses (`processing`, `translating`, `exporting`) are protected

## 9. Supabase Client Notes

A custom lightweight Supabase client is implemented using `httpx`.

`single/maybeSingle` behavior:
- zero-row response returns `None`
- multi-row anomalies are not silently ignored anymore and raise errors

This is intentional to catch data consistency issues early.

## 10. FFmpeg and Media Pipeline

Used for:
- media probing
- subtitle extraction
- burn-in rendering
- soft-sub muxing

Strategy:
- large file operations prefer copy-on-disk over in-memory load
- export progress is written to job status

## 11. Operations

Production baseline:
- set `DEBUG=false`
- keep Redis and Celery always running
- monitor `/health`
- preserve `backend_storage` volume

Scaling levers:
- backend worker count in `backend/Dockerfile` CMD
- celery concurrency in `docker-compose.yml`
- primary bottlenecks are FFmpeg and external translation APIs

## 12. Troubleshooting

Jobs stuck in queued:
- check `celery-worker` logs
- validate Redis connectivity

401/403 issues:
- validate Supabase keys and token flow

File-not-found issues:
- verify `STORAGE_DIR` mount
- verify `/files/` path boundaries

## 13. Development Checklist

When adding a new endpoint:
1. add schema in `models/schemas.py`
2. implement route handler
3. apply proper auth/role checks
4. standardize HTTP error responses
5. dispatch to queue if workload is heavy

When adding a background task:
1. implement task in `workers/tasks.py`
2. dispatch with `delay()` from API layer
3. define status lifecycle (`queued -> processing -> completed/failed/cancelled`)
4. ensure project status rollback/recovery paths are handled

