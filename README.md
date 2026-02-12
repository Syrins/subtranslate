# SubTranslate

A web-based subtitle translation and high-quality video export platform for anime/TV/movie translators.

## Features

### Video & Subtitle Management
- 📹 **MKV Upload** - Upload MKV files or provide video links
- 📝 **Subtitle Extraction** - Automatically extract SRT/ASS subtitles from videos
- 🔄 **Multi-format Support** - Handle both SRT and ASS subtitle formats

### Translation Services
- 🤖 **OpenAI Integration** - Translate using GPT-4 for high-quality results
- 🌐 **DeepL Integration** - Professional-grade neural translation
- 💫 **Google Gemini** - Google's latest AI translation capabilities

### Subtitle Editor
- ✏️ **Live Preview** - Real-time preview of subtitle styling
- 🎨 **Styling Controls** - Customize font, color, outline, and position
- 📊 **Multi-language** - Manage multiple subtitle tracks per project

### Video Export
- 🎬 **Burn-in Subtitles** - Hard-code subtitles directly into video
- 📎 **Soft Subtitles** - Export with embedded subtitle tracks (MP4)
- 💧 **Watermarking** - Add custom watermarks to exported videos
- 🎵 **Multi-audio** - Support for multiple audio tracks

### Infrastructure
- 👥 **Plan Limits** - Enforce project limits and retention policies
- ⚡ **Job Queue** - Redis-based background job processing with BullMQ
- 🔐 **Presigned URLs** - Secure direct uploads to Cloudflare R2 or Backblaze B2
- 🗄️ **PostgreSQL** - Robust data persistence with Prisma ORM

## Architecture

### Tech Stack

**Backend:**
- Node.js + TypeScript
- Express.js
- Prisma ORM
- PostgreSQL
- Redis + BullMQ (job queue)
- FFmpeg (video processing)

**Frontend:**
- React + TypeScript
- Vite
- React Router
- Zustand (state management)
- TanStack Query (data fetching)

**Storage:**
- Cloudflare R2 (S3-compatible)
- Backblaze B2 (S3-compatible)

## Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+
- FFmpeg 4+

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Syrins/subtranslate.git
cd subtranslate
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
```

4. **Setup database**
```bash
cd backend
npm run prisma:migrate
npm run prisma:generate
```

5. **Seed initial data (optional)**
```bash
# Create plan data
npx prisma db seed
```

### Running the Application

**Development mode (both frontend and backend):**
```bash
npm run dev
```

**Or run separately:**

Backend:
```bash
npm run dev:backend
# Server runs on http://localhost:3000
```

Frontend:
```bash
npm run dev:frontend
# App runs on http://localhost:5173
```

Worker (for background jobs):
```bash
cd backend
npm run worker
```

### Production Build

```bash
npm run build
```

## API Documentation

### Authentication

**Register:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

**Login:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### Projects

**Create Project:**
```http
POST /api/projects
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "My Video Project",
  "sourceVideoUrl": "https://example.com/video.mkv"
}
```

**List Projects:**
```http
GET /api/projects
Authorization: Bearer {token}
```

### Subtitles

**Translate Subtitle:**
```http
POST /api/subtitles/{id}/translate
Authorization: Bearer {token}
Content-Type: application/json

{
  "targetLanguage": "English",
  "service": "openai"
}
```

### Jobs

**Export Video:**
```http
POST /api/jobs/export
Authorization: Bearer {token}
Content-Type: application/json

{
  "projectId": "project-id",
  "subtitleId": "subtitle-id",
  "burnSubtitles": true,
  "watermark": true,
  "watermarkText": "My Watermark"
}
```

### Storage

**Get Upload URL:**
```http
POST /api/storage/upload-url
Authorization: Bearer {token}
Content-Type: application/json

{
  "fileName": "video.mkv",
  "contentType": "video/x-matroska",
  "storageType": "r2"
}
```

## Configuration

### Environment Variables

See `backend/.env.example` for all available configuration options.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_HOST` - Redis host for job queue
- `JWT_SECRET` - Secret key for JWT tokens

**Translation Services (at least one):**
- `OPENAI_API_KEY` - OpenAI API key
- `DEEPL_API_KEY` - DeepL API key
- `GEMINI_API_KEY` - Google Gemini API key

**Storage (at least one):**
- R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, etc.)
- B2 credentials (B2_KEY_ID, B2_APPLICATION_KEY, etc.)

### Plan Configuration

Plans are stored in the database. Example plan structure:

```typescript
{
  id: "free",
  name: "Free Plan",
  maxProjects: 3,
  maxVideoSizeMB: 100,
  retentionDays: 7,
  allowWatermark: false,
  allowMultiAudio: false,
  translationQuota: 10
}
```

## Project Structure

```
subtranslate/
├── backend/
│   ├── src/
│   │   ├── config/         # Configuration
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── workers/        # Background job workers
│   │   └── index.ts        # Entry point
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   ├── stores/         # State management
│   │   └── styles/         # CSS styles
│   └── package.json
└── package.json            # Root package.json
```

## Deployment

### Docker (Recommended)

A Docker setup can be created for easy deployment:

```bash
docker-compose up -d
```

### Manual Deployment

1. Build the application:
```bash
npm run build
```

2. Set up PostgreSQL and Redis instances

3. Configure production environment variables

4. Run database migrations:
```bash
cd backend && npm run prisma:migrate
```

5. Start the services:
```bash
# Backend API
cd backend && npm start

# Worker process
cd backend && npm run worker

# Frontend (serve with nginx or similar)
```

## Development

### Adding a New Translation Service

1. Add the service to `backend/src/services/translation.ts`
2. Update the type definitions
3. Add API key to environment configuration

### Adding New Job Types

1. Define the job handler in `backend/src/workers/index.ts`
2. Create the job type in the Prisma schema
3. Add API endpoints for triggering the job

## Troubleshooting

**FFmpeg not found:**
- Install FFmpeg: `sudo apt-get install ffmpeg` (Linux) or `brew install ffmpeg` (macOS)
- Or specify path in environment: `FFMPEG_PATH=/path/to/ffmpeg`

**Database connection issues:**
- Verify PostgreSQL is running
- Check DATABASE_URL format: `postgresql://user:password@host:port/database`

**Redis connection issues:**
- Ensure Redis is running
- Verify REDIS_HOST and REDIS_PORT

## License

MIT License - see [LICENSE](LICENSE) file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on GitHub.