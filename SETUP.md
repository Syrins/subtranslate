# Setup Guide

This guide will help you set up the SubTranslate platform for development or production.

## Development Setup

### 1. Prerequisites

Install the following software:
- **Node.js 18+**: [Download](https://nodejs.org/)
- **PostgreSQL 14+**: [Download](https://www.postgresql.org/download/)
- **Redis 6+**: [Download](https://redis.io/download)
- **FFmpeg 4+**: [Download](https://ffmpeg.org/download.html)

### 2. Clone and Install

```bash
# Clone the repository
git clone https://github.com/Syrins/subtranslate.git
cd subtranslate

# Install all dependencies (root, backend, and frontend)
npm install
```

### 3. Database Setup

```bash
# Create a PostgreSQL database
createdb subtranslate

# Or using psql:
psql -U postgres
CREATE DATABASE subtranslate;
\q
```

### 4. Configure Environment

```bash
# Copy the example environment file
cd backend
cp .env.example .env

# Edit .env with your configuration
nano .env  # or use your preferred editor
```

**Minimum required configuration:**
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/subtranslate
JWT_SECRET=your-random-secret-key-here
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Add at least one translation service:**
```env
OPENAI_API_KEY=sk-...
# OR
DEEPL_API_KEY=...
# OR
GEMINI_API_KEY=...
```

**Add at least one storage provider:**
```env
# Cloudflare R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=subtranslate

# OR Backblaze B2
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET_NAME=subtranslate
B2_BUCKET_ID=...
```

### 5. Run Database Migrations

```bash
cd backend
npm run prisma:migrate
npm run prisma:generate
```

### 6. Seed Initial Data

```bash
cd backend
npx prisma db seed
```

This creates the following plans:
- **Free**: 3 projects, 100MB videos, 7-day retention
- **Pro**: 20 projects, 500MB videos, 30-day retention
- **Enterprise**: Unlimited projects, 2GB videos, 1-year retention

### 7. Start Services

**Option A: Start everything together**
```bash
# From project root
npm run dev
```

This starts:
- Backend API on http://localhost:3000
- Frontend on http://localhost:5173

**Option B: Start services separately**

Terminal 1 - Backend API:
```bash
npm run dev:backend
```

Terminal 2 - Frontend:
```bash
npm run dev:frontend
```

Terminal 3 - Worker (for background jobs):
```bash
cd backend
npm run worker
```

### 8. Access the Application

Open your browser to http://localhost:5173

Create an account and start using the platform!

## Production Setup

### Using Docker (Recommended)

1. **Configure environment**
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with production values
```

2. **Build and start services**
```bash
docker-compose up -d
```

3. **Run migrations**
```bash
docker-compose exec backend npm run prisma:migrate
docker-compose exec backend npx prisma db seed
```

4. **Access the application**
- Frontend: http://localhost
- Backend API: http://localhost:3000

### Manual Production Deployment

1. **Build the application**
```bash
npm run build
```

2. **Set up PostgreSQL and Redis**
- Use managed services (AWS RDS, ElastiCache, etc.)
- Or set up your own instances

3. **Configure production environment**
```bash
cd backend
cp .env.example .env
# Set all production values including:
# - Production DATABASE_URL
# - Production REDIS_HOST
# - Strong JWT_SECRET
# - All API keys
# - Storage credentials
```

4. **Run database migrations**
```bash
cd backend
npm run prisma:migrate
npm run prisma:generate
npx prisma db seed
```

5. **Start backend services**

Using PM2:
```bash
# Install PM2
npm install -g pm2

# Start API
cd backend
pm2 start dist/index.js --name subtranslate-api

# Start worker
pm2 start dist/workers/index.js --name subtranslate-worker

# Save PM2 configuration
pm2 save
pm2 startup
```

6. **Serve frontend**

Using nginx:
```bash
# Copy built files to nginx directory
sudo cp -r frontend/dist/* /var/www/subtranslate/

# Configure nginx (see frontend/nginx.conf)
sudo nano /etc/nginx/sites-available/subtranslate
sudo ln -s /etc/nginx/sites-available/subtranslate /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Storage Configuration

### Cloudflare R2

1. Create an R2 bucket in Cloudflare dashboard
2. Generate API tokens with read/write permissions
3. Add credentials to `.env`:
```env
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=subtranslate
```

### Backblaze B2

1. Create a B2 bucket
2. Generate application keys
3. Add credentials to `.env`:
```env
B2_KEY_ID=your-key-id
B2_APPLICATION_KEY=your-app-key
B2_BUCKET_NAME=subtranslate
B2_BUCKET_ID=your-bucket-id
```

## Translation Services Configuration

### OpenAI

1. Get API key from https://platform.openai.com/api-keys
2. Add to `.env`:
```env
OPENAI_API_KEY=sk-...
```

### DeepL

1. Get API key from https://www.deepl.com/pro-api
2. Add to `.env`:
```env
DEEPL_API_KEY=...
```

### Google Gemini

1. Get API key from https://makersuite.google.com/app/apikey
2. Add to `.env`:
```env
GEMINI_API_KEY=...
```

## Troubleshooting

### Database Connection Failed
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
- Check connection string in `.env`
- Ensure database exists: `psql -l`

### Redis Connection Failed
- Verify Redis is running: `redis-cli ping`
- Should return `PONG`
- Check REDIS_HOST and REDIS_PORT in `.env`

### FFmpeg Not Found
- Linux: `sudo apt-get install ffmpeg`
- macOS: `brew install ffmpeg`
- Windows: Download from https://ffmpeg.org/
- Or specify path: `FFMPEG_PATH=/path/to/ffmpeg`

### Port Already in Use
- Backend (3000): `lsof -ti:3000 | xargs kill -9`
- Frontend (5173): `lsof -ti:5173 | xargs kill -9`

### Worker Not Processing Jobs
- Ensure Redis is running
- Check worker logs: `cd backend && npm run worker`
- Verify Redis connection in worker output

## Health Checks

Test if services are running:

```bash
# Backend health
curl http://localhost:3000/health

# Frontend
curl http://localhost:5173

# Redis
redis-cli ping

# PostgreSQL
psql -U postgres -d subtranslate -c "SELECT 1"
```

## Next Steps

- Configure your storage provider (R2 or B2)
- Set up at least one translation service
- Create user accounts
- Start creating projects!

For more information, see the main [README.md](../README.md).
