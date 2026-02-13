# Deploy Guide (EN) - Coolify + Docker Compose

This document provides the production deployment steps for SubTranslate on Coolify using Docker Compose.

## 1. Architecture Summary

Compose services:
- `redis`
- `backend`
- `celery-worker`
- `celery-beat`
- `frontend`

Public-facing services:
- `frontend`
- `backend`

No public domain for:
- `redis`
- `celery-worker`
- `celery-beat`

## 2. DNS Preparation

Required A records:
- `subtranslate.syrins.tech` -> Coolify host IP
- `subtranslate-backend.syrins.tech` -> Coolify host IP

Important:
- SSL issuance may fail until DNS propagation is complete.

## 3. Create Coolify Resource

1. Open your Coolify project.
2. Click `Create New Resource`.
3. Connect repository.
4. Select `Docker Compose` build pack.
5. Base directory: `/`
6. Compose path: `/docker-compose.yml`

## 4. Domain Settings

Assign domains in Coolify UI per service:
- Backend: `https://backend.example.com:8000`
- Frontend: `https://example.com:3000`

The port number only tells Coolify which container port to route to. External traffic is served on 443 (HTTPS).

Leave empty:
- redis domains
- celery-worker domains
- celery-beat domains

Important:
- No `ports:` defined in compose — Coolify Traefik proxy handles routing.
- If you must expose host ports, use unique host ports per app (example: `3100:3000` for frontend).

## 5. SSL / HTTPS

Coolify can automatically provision Let's Encrypt certificates.

Prerequisites:
- DNS must point to the correct server
- ports 80/443 must be open
- no proxy/CDN rule should block ACME challenge

## 6. Environment Variables

Required variables (`${VAR:?}` — shown with red border in Coolify UI):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `CORS_ORIGINS`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`

Optional (`${VAR:-default}`):
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_CDN_DOMAIN`
- `OPENAI_API_KEY`, `DEEPL_API_KEY`, `GEMINI_API_KEY`
- `DEBUG` (default: `false` — Swagger UI disabled)

Domain-specific examples:
- `CORS_ORIGINS=https://example.com`
- `NEXT_PUBLIC_API_URL=https://example.com`

## 7. Coolify Magic Variables

Auto-generated variables (do NOT set manually):
- `SERVICE_PASSWORD_REDIS` — secure password for internal Redis (injected to all services)
- `SERVICE_URL_BACKEND` — Backend URL
- `SERVICE_FQDN_BACKEND` — Backend domain
- `SERVICE_URL_FRONTEND` — Frontend URL
- `SERVICE_FQDN_FRONTEND` — Frontend domain

Redis password is referenced as `SERVICE_PASSWORD_REDIS` in `docker-compose.yml`.
Coolify generates it automatically during deployment — no manual setup needed.

## 8. Volumes and Persistence

Compose volumes:
- `redis_data`
- `backend_storage`
- `backend_tmp`

Critical:
- do not delete `backend_storage` or `backend_tmp`
- user files and processing artifacts rely on these volumes

## 9. Post-Deploy Validation

1. `https://example.com/health`
2. frontend login/register flow
3. video/subtitle upload flow
4. translation job lifecycle
5. export job lifecycle
6. download endpoint behavior

## 10. Common Failure Cases

### 10.1 SSL cannot be issued
- incorrect DNS target
- closed 80/443 ports
- ACME challenge blocked by proxy/CDN

### 10.2 Jobs stay queued
- `celery-worker` is not running
- Redis connectivity is broken

### 10.3 Frontend cannot reach backend
- wrong `NEXT_PUBLIC_API_URL`
- wrong backend domain/port mapping

### 10.4 CORS errors
- `CORS_ORIGINS` does not exactly match frontend domain

### 10.5 Deployment fails with "port is already allocated"
- Error example: `Bind for 0.0.0.0:3000 failed: port is already allocated`
- Root cause: another process/container on the host already uses that host port
- Fix:
  - Remove fixed host-port mapping for frontend/backend when using domain-based proxying
  - Or change to an unused host port (example frontend `3100:3000`)
  - Verify conflict on host:
    - `docker ps --format '{{.Names}}\t{{.Ports}}' | grep ':3000->'`
    - `sudo lsof -iTCP:3000 -sTCP:LISTEN -P -n`

## 11. Production Recommendations

- `DEBUG=false` (disables Swagger UI, ReDoc, OpenAPI schema)
- Rotate secrets regularly
- Worker concurrency=2 (each task uses FFmpeg with 6 threads)
- FFmpeg limited to `-threads 6` across all operations (~25% of 24 cores)
- Upscale: Lanczos quality up to 2x, beyond 2x is blocked
- Non-root container users (backend: appuser:1001, frontend: nextjs:1001)
- Enable monitoring/log retention
- Test backup and restore routinely

### Resource Limits

| Service | CPU Limit | RAM Limit |
|---|---|---|
| Redis | - | 1G |
| Backend | 3 | 4G |
| Celery Worker | 6 | 16G |
| Celery Beat | 0.5 | 256M |
| Frontend | 2 | 2G |
| **Total** | **11.5** | **~23G** |

## 12. Rollback Strategy

1. pick last known good commit/tag
2. trigger redeploy in Coolify
3. run health and critical flow checks
4. apply db migration rollback plan when required
