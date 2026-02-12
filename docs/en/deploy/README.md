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

Use container port mappings:
- Backend: `https://subtranslate-backend.syrins.tech:8000`
- Frontend: `https://subtranslate.syrins.tech:3000`

Leave empty:
- celery-worker domains
- celery-beat domains

## 5. SSL / HTTPS

Coolify can automatically provision Let's Encrypt certificates.

Prerequisites:
- DNS must point to the correct server
- ports 80/443 must be open
- no proxy/CDN rule should block ACME challenge

## 6. Environment Variables

Required variables from `docker-compose.yml`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `CORS_ORIGINS`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`

Optional variables:
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET_NAME`
- `R2_CDN_DOMAIN`
- `OPENAI_API_KEY`
- `DEEPL_API_KEY`
- `GEMINI_API_KEY`
- `DEBUG`

Domain-specific examples:
- `CORS_ORIGINS=https://subtranslate.syrins.tech`
- `NEXT_PUBLIC_API_URL=https://subtranslate-backend.syrins.tech`

## 7. Auto-generated Coolify Service Variables

Depending on setup, you may see:
- `SERVICE_URL_BACKEND`
- `SERVICE_FQDN_BACKEND`
- `SERVICE_URL_FRONTEND`
- `SERVICE_FQDN_FRONTEND`

If your app does not explicitly use them, they can remain as Coolify metadata values.

## 8. Volumes and Persistence

Compose volumes:
- `redis_data`
- `backend_storage`
- `backend_tmp`

Critical:
- do not delete `backend_storage` or `backend_tmp`
- user files and processing artifacts rely on these volumes

## 9. Post-Deploy Validation

1. `https://subtranslate-backend.syrins.tech/health`
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

## 11. Production Recommendations

- keep `DEBUG=false`
- rotate secrets regularly
- tune worker concurrency to host CPU
- enable monitoring/log retention
- test backup and restore routinely

## 12. Rollback Strategy

1. pick last known good commit/tag
2. trigger redeploy in Coolify
3. run health and critical flow checks
4. apply db migration rollback plan when required

