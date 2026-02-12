# Quick Start Guide

Get SubTranslate running in 5 minutes!

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (easiest option)
- OR PostgreSQL + Redis installed locally

## Option 1: Docker (Recommended for Quick Start)

### 1. Clone the Repository

```bash
git clone https://github.com/Syrins/subtranslate.git
cd subtranslate
```

### 2. Configure Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` and add at least one translation API key:

```env
# Add ONE of these:
OPENAI_API_KEY=sk-your-key-here
# OR
DEEPL_API_KEY=your-key-here
# OR
GEMINI_API_KEY=your-key-here

# Add ONE of these for storage:
R2_ACCOUNT_ID=your-account
R2_ACCESS_KEY_ID=your-key
R2_SECRET_ACCESS_KEY=your-secret
R2_BUCKET_NAME=subtranslate
# OR
B2_KEY_ID=your-key
B2_APPLICATION_KEY=your-app-key
B2_BUCKET_NAME=subtranslate
```

### 3. Start Everything

```bash
cd ..
docker-compose up -d
```

### 4. Run Migrations & Seed

```bash
docker-compose exec backend npm run prisma:migrate
docker-compose exec backend npx prisma db seed
```

### 5. Access the App

Open http://localhost in your browser!

---

## Option 2: Local Development

### 1. Clone the Repository

```bash
git clone https://github.com/Syrins/subtranslate.git
cd subtranslate
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start PostgreSQL and Redis

**macOS (Homebrew):**
```bash
brew services start postgresql
brew services start redis
```

**Linux:**
```bash
sudo systemctl start postgresql
sudo systemctl start redis
```

**Windows:**
Use WSL2 or Docker Desktop

### 4. Create Database

```bash
createdb subtranslate
```

### 5. Configure Environment

```bash
cd backend
cp .env.example .env
nano .env  # Edit with your settings
```

Minimum configuration:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/subtranslate
JWT_SECRET=change-this-to-random-string
REDIS_HOST=localhost
REDIS_PORT=6379

# Add at least one translation API key
OPENAI_API_KEY=sk-...
```

### 6. Run Migrations & Seed

```bash
npm run prisma:migrate
npm run prisma:generate
npx prisma db seed
```

### 7. Start Development Servers

**Terminal 1 - Backend & Frontend:**
```bash
cd ..  # back to root
npm run dev
```

**Terminal 2 - Worker (optional, for background jobs):**
```bash
cd backend
npm run worker
```

### 8. Access the App

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

---

## First Steps After Installation

### 1. Create an Account

1. Go to http://localhost:5173 (or http://localhost)
2. Click "Need an account? Register"
3. Enter your email and password
4. Click "Register"

### 2. Create Your First Project

1. Click "+ New Project"
2. Enter a project name (e.g., "Test Project")
3. Optionally add a video URL
4. Click "Create"

### 3. Add a Subtitle

1. Click on your project
2. Click "+ Translate" (or manually create)
3. Add subtitle content in SRT format:
   ```
   1
   00:00:01,000 --> 00:00:03,000
   Hello World

   2
   00:00:04,000 --> 00:00:06,000
   This is a test subtitle
   ```

### 4. Translate It

1. Select your subtitle
2. Choose target language (e.g., "Spanish")
3. Select translation service (OpenAI/DeepL/Gemini)
4. Click "Translate"

### 5. Edit & Style

1. Click on the translated subtitle
2. Use the styling controls:
   - Font family
   - Font size
   - Colors
   - Position
3. See live preview
4. Click "Save Changes"

### 6. Export Video

1. Go back to project
2. Click "Export Video"
3. Choose subtitle track
4. Configure options:
   - ✅ Burn subtitles (hard-coded)
   - ✅ Add watermark
5. Click "Start Export"
6. Monitor job progress

---

## Testing the API

### Quick API Test

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test User"}'

# This will return a token, use it for authenticated requests
```

### Full workflow test script

See [API_EXAMPLES.md](API_EXAMPLES.md) for complete examples.

---

## Troubleshooting

### Port Already in Use

**Backend (3000):**
```bash
lsof -ti:3000 | xargs kill -9
```

**Frontend (5173):**
```bash
lsof -ti:5173 | xargs kill -9
```

### Database Connection Error

```bash
# Check PostgreSQL is running
pg_isready

# Verify connection string in backend/.env
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

### Redis Connection Error

```bash
# Check Redis is running
redis-cli ping
# Should return: PONG

# Verify Redis config in backend/.env
```

### FFmpeg Not Found

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt-get install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/ and add to PATH

### Translation Not Working

1. Verify API key is set in `.env`
2. Check you have credits/quota on your translation service
3. Check backend logs for errors

### Docker Issues

```bash
# Stop all containers
docker-compose down

# Remove volumes and restart
docker-compose down -v
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f worker
```

---

## Environment Plans

The platform comes with 3 pre-configured plans:

| Plan | Projects | Video Size | Retention | Translation Quota |
|------|----------|------------|-----------|-------------------|
| Free | 3 | 100MB | 7 days | 10/month |
| Pro | 20 | 500MB | 30 days | 100/month |
| Enterprise | Unlimited | 2GB | 365 days | Unlimited |

All new users start on the **Free** plan.

---

## What's Next?

- Read [SETUP.md](SETUP.md) for detailed setup instructions
- Check [API_EXAMPLES.md](API_EXAMPLES.md) for API usage
- Review [ARCHITECTURE.md](ARCHITECTURE.md) to understand the system
- See [README.md](README.md) for complete documentation

## Need Help?

- Check the troubleshooting section above
- Review the logs: `docker-compose logs -f` or `npm run dev`
- Open an issue on GitHub

---

**Happy Translating! 🎬✨**
