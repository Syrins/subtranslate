# Troubleshooting Guide

## Common Issues and Solutions

### 1. Celery Worker Cannot Connect to Redis

**Error Message:**
```
[ERROR/MainProcess] consumer: Cannot connect to redis://redis:6379/0: Error 22 connecting to redis:6379. Invalid argument.
```

**Root Cause:**
Socket keepalive options using platform-specific integer constants (TCP_KEEPIDLE, TCP_KEEPINTVL, TCP_KEEPCNT) are not compatible across all Docker/Linux environments.

**Solution:**
The issue has been fixed in [celery_app.py](../backend/app/workers/celery_app.py) by:
- Removing `socket_keepalive_options` with platform-specific constants
- Keeping `health_check_interval: 30` for connection monitoring
- Increasing `broker_pool_limit` from 1 to 10 for better performance

**Verification:**
```bash
# Check celery worker logs
docker logs <celery-worker-container>

# Should show:
# [tasks]
#   . app.workers.tasks.cleanup_expired_files_task
#   . app.workers.tasks.reset_monthly_usage
#   . app.workers.tasks.run_export_task
#   . app.workers.tasks.run_project_processing_task
#   . app.workers.tasks.run_translation_task
# [INFO/MainProcess] Connected to redis://redis:6379/0
```

---

### 2. Redis Memory Warning

**Warning Message:**
```
WARNING Memory overcommit must be enabled! Without it, a background save or replication may fail under low memory condition.
```

**Impact:**
This is a warning, not an error. Redis will still work, but background saves might fail under memory pressure.

**Solution (Coolify/Docker):**
This is handled by Coolify's host configuration. No action needed unless you see actual Redis failures.

**Solution (Linux Host):**
```bash
sudo sysctl vm.overcommit_memory=1
# Make permanent:
echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf
```

---

### 3. Backend Cannot Access Storage

**Error Message:**
```
FileNotFoundError: [Errno 2] No such file or directory: '/app/storage/users/...'
```

**Root Cause:**
Storage volumes not properly mounted or directories not created.

**Solution:**
Check docker-compose.yml volumes:
```yaml
volumes:
  - backend_storage:/app/storage
  - backend_tmp:/app/tmp
```

Recreate containers with volumes:
```bash
docker-compose down
docker-compose up -d
```

---

### 4. Frontend Build Fails - Missing Environment Variables

**Error Message:**
```
Error: NEXT_PUBLIC_SUPABASE_URL is not defined
```

**Root Cause:**
Next.js requires `NEXT_PUBLIC_*` variables at **build time** (they're baked into the bundle).

**Solution (Coolify):**
1. Go to your frontend service
2. Add build-time environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com
   ```
3. Rebuild the service

**Solution (docker-compose):**
Set variables in `.env` file at the root:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

### 5. Celery Beat Not Scheduling Tasks

**Symptoms:**
- No automatic cleanup of expired files
- Monthly usage not resetting

**Root Cause:**
- Celery beat schedule persistence file issues
- Multiple beat instances running

**Solution:**
```bash
# Stop all celery services
docker-compose stop celery-beat celery-worker

# Remove old schedule files
docker-compose exec celery-beat rm -f /tmp/celerybeat-schedule*

# Restart
docker-compose up -d celery-beat celery-worker
```

**Verification:**
```bash
# Check beat logs
docker logs <celery-beat-container>

# Should show scheduled tasks:
# Scheduler: Sending due task cleanup-expired-files
# Scheduler: Sending due task reset-monthly-usage
```

---

### 6. High Memory Usage

**Symptoms:**
- Backend OOM (Out of Memory)
- Slow translation processing

**Root Cause:**
- Large video files loaded into memory
- FFmpeg processes

**Solutions:**

1. **Use file streaming** (already implemented in storage.py):
```python
# Good: Uses file paths
storage.copy_to(key, dest_path)
storage.upload_file(key, file_path)

# Avoid: Loads into RAM
data = storage.download(key)  # Only for small files
```

2. **Limit concurrent workers:**
```yaml
# In docker-compose.yml
celery-worker:
  command: celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
```

3. **Set memory limits (Coolify):**
   - Backend: 2GB
   - Celery Worker: 4GB (FFmpeg needs more)
   - Redis: 512MB

---

### 7. Translation Jobs Stuck in "Processing"

**Symptoms:**
- Job stays at "processing" indefinitely
- No error in logs

**Root Cause:**
- Celery worker crashed
- API key invalid/expired
- Network timeout to AI service

**Debug:**
```bash
# Check worker logs
docker logs <celery-worker-container> --tail 100

# Check job in database
# Look for error_message field in translation_jobs table
```

**Solutions:**
1. Check API keys in environment variables
2. Restart celery worker
3. Cancel stuck job and retry:
```bash
curl -X POST http://localhost:8000/translate/{job_id}/cancel \
  -H "Authorization: Bearer $TOKEN"
```

---

### 8. CORS Errors in Frontend

**Error Message (Browser Console):**
```
Access to XMLHttpRequest at 'https://api.domain.com' from origin 'https://app.domain.com' has been blocked by CORS policy
```

**Solution:**
Update `CORS_ORIGINS` in backend environment:
```bash
# Coolify: Add to backend service env
CORS_ORIGINS=https://app.yourdomain.com,https://www.yourdomain.com

# docker-compose: Update .env
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
```

Restart backend:
```bash
docker-compose restart backend
```

---

## Deployment Checklist (Coolify)

- [ ] **Environment Variables Set:**
  - [ ] Backend: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIS_URL, CORS_ORIGINS
  - [ ] Frontend: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_URL
  - [ ] Workers: All backend vars + AI API keys (OPENAI_API_KEY, DEEPL_API_KEY, GEMINI_API_KEY)

- [ ] **Health Checks Configured:**
  - [ ] Backend: `/health` endpoint
  - [ ] Frontend: `http://localhost:3000`
  - [ ] Redis: `redis-cli ping`

- [ ] **Volumes Mounted:**
  - [ ] `redis_data:/data`
  - [ ] `backend_storage:/app/storage`
  - [ ] `backend_tmp:/app/tmp`

- [ ] **Service Dependencies:**
  - [ ] Backend depends on Redis (healthy)
  - [ ] Workers depend on Redis (healthy)
  - [ ] Frontend depends on Backend (healthy)

- [ ] **Ports Exposed:**
  - [ ] Backend: 8000
  - [ ] Frontend: 3000
  - [ ] Redis: 6379 (internal only)

---

## Logs & Monitoring

### View Logs (Docker)
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f celery-worker

# Last 100 lines
docker-compose logs --tail 100 celery-worker
```

### View Logs (Coolify)
1. Go to service page
2. Click "Logs" tab
3. Select log type (build, deployment, application)

### Key Log Patterns

**Healthy Backend:**
```
[info] server_starting debug=False host=0.0.0.0 port=8000
[info] ffmpeg_ready ffmpeg=/usr/local/lib/python3.12/site-packages/static_ffmpeg/bin/linux/ffmpeg
[info] storage_dir exists=True path=/app/storage
INFO: Uvicorn running on http://0.0.0.0:8000
```

**Healthy Celery Worker:**
```
[tasks]
  . app.workers.tasks.run_translation_task
  . app.workers.tasks.run_export_task
  ...
[INFO/MainProcess] Connected to redis://redis:6379/0
[INFO/MainProcess] celery@hostname ready.
```

**Healthy Redis:**
```
Ready to accept connections tcp
```

---

## Performance Tuning

### Celery Worker Concurrency
```yaml
# Low memory (< 4GB)
--concurrency=2

# Standard (4-8GB)
--concurrency=4

# High memory (> 8GB)
--concurrency=8
```

### Redis Memory
```yaml
redis:
  command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
```

### Backend Workers
```yaml
# In Dockerfile CMD
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2

# For high traffic:
--workers 4
```

---

## Related Documentation

- [Main README](../README.md)
- [Backend Documentation](tr/backend/README.md)
- [Frontend Documentation](tr/frontend/README.md)
- [Deployment Guide](tr/deploy/README.md)
