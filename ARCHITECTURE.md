# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           React Frontend (Vite + TypeScript)              │  │
│  │                                                            │  │
│  │  • Login/Register Pages                                   │  │
│  │  • Project Dashboard                                      │  │
│  │  • Subtitle Editor (Live Preview)                         │  │
│  │  • Export Configuration                                   │  │
│  │  • Job Status Tracking                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            │ HTTP/REST API                       │
│                            ▼                                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      API SERVER LAYER                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │        Express.js API Server (Node.js + TypeScript)       │  │
│  │                                                            │  │
│  │  Routes:                                                   │  │
│  │  ├── /api/auth        (Login, Register)                   │  │
│  │  ├── /api/projects    (CRUD Projects)                     │  │
│  │  ├── /api/subtitles   (CRUD Subtitles, Translate)         │  │
│  │  ├── /api/jobs        (Create Export Jobs, Status)        │  │
│  │  └── /api/storage     (Presigned URLs)                    │  │
│  │                                                            │  │
│  │  Middleware:                                               │  │
│  │  ├── JWT Authentication                                   │  │
│  │  ├── Plan Limits Check                                    │  │
│  │  └── Error Handling                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   PostgreSQL    │ │   Redis Queue   │ │  Storage (R2/B2)│
│    Database     │ │    (BullMQ)     │ │                 │
│                 │ │                 │ │  ┌───────────┐  │
│ • Users         │ │ • Extract Jobs  │ │  │ Presigned │  │
│ • Projects      │ │ • Translate Jobs│ │  │   URLs    │  │
│ • Subtitles     │ │ • Export Jobs   │ │  └───────────┘  │
│ • Jobs          │ │                 │ │                 │
│ • Plans         │ │                 │ │  • Videos       │
└─────────────────┘ └─────────────────┘ │  • Exports      │
                             │           └─────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Worker Process │
                    │                 │
                    │  ┌───────────┐  │
                    │  │  Extract  │  │
                    │  │  Handler  │  │
                    │  └───────────┘  │
                    │                 │
                    │  ┌───────────┐  │
                    │  │  Export   │  │
                    │  │  Handler  │  │
                    │  └───────────┘  │
                    └─────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     FFmpeg      │
                    │                 │
                    │ • Extract Subs  │
                    │ • Burn Subs     │
                    │ • Add Watermark │
                    │ • Mux Tracks    │
                    └─────────────────┘
```

## External Services Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSLATION SERVICES                          │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐       │
│  │   OpenAI     │   │    DeepL     │   │    Gemini    │       │
│  │   GPT-4      │   │  Neural MT   │   │  Google AI   │       │
│  └──────────────┘   └──────────────┘   └──────────────┘       │
│         ▲                  ▲                  ▲                 │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                    Translation Service
                         Abstraction
                             │
                             ▼
                    ┌─────────────────┐
                    │   Subtitle      │
                    │   Translation   │
                    │   Service       │
                    └─────────────────┘
```

## Data Flow

### 1. User Registration/Login Flow

```
User → Frontend → API Server → PostgreSQL
                       ↓
                  JWT Token
                       ↓
                   Frontend
                   (Stored)
```

### 2. Project Creation Flow

```
User → Frontend → API Server → PostgreSQL (Create Project)
                       ↓
                   Check Plan Limits
                       ↓
             Create Extraction Job (if video URL)
                       ↓
                  Redis Queue
                       ↓
                  Worker Process
                       ↓
                Download Video → FFmpeg Extract → Save Subtitles
                       ↓
                Update Project Status
```

### 3. Translation Flow

```
User → Frontend → Select Subtitle → API Server
                                         ↓
                              Translation Service
                            (OpenAI/DeepL/Gemini)
                                         ↓
                            Parse SRT → Translate Each Block
                                         ↓
                              Format Back to SRT
                                         ↓
                          Create New Subtitle Record
                                         ↓
                            Return to Frontend
```

### 4. Video Export Flow

```
User → Frontend → Configure Export → API Server
                                         ↓
                                  Create Export Job
                                         ↓
                                   Redis Queue
                                         ↓
                                  Worker Process
                                         ↓
                          ┌────────────────────────┐
                          │   Export Options:      │
                          │                        │
                          │  Burn-in Subtitles?    │
                          │      ├─ Yes → FFmpeg   │
                          │      └─ No  → Soft-sub │
                          │                        │
                          │  Add Watermark?        │
                          │      └─ Yes → FFmpeg   │
                          │                        │
                          │  Multi-audio?          │
                          │      └─ Yes → Mux      │
                          └────────────────────────┘
                                         ↓
                                Upload to Storage
                                         ↓
                          Generate Download URL
                                         ↓
                               Update Job Status
```

### 5. Storage Upload Flow

```
User → Frontend → Request Upload URL → API Server
                                            ↓
                          Generate Presigned URL (R2/B2)
                                            ↓
                                    Return URL to Frontend
                                            ↓
User → Direct Upload to Storage (bypasses API server)
```

## Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      SECURITY LAYERS                             │
│                                                                  │
│  Layer 1: Authentication                                         │
│  ├── JWT Token Verification                                     │
│  ├── Bcrypt Password Hashing                                    │
│  └── Token Expiration (7 days default)                          │
│                                                                  │
│  Layer 2: Authorization                                          │
│  ├── User owns Project/Subtitle check                           │
│  ├── Plan limits enforcement                                    │
│  └── Feature access by plan                                     │
│                                                                  │
│  Layer 3: Data Security                                          │
│  ├── Presigned URLs (time-limited)                              │
│  ├── Direct storage access (no proxy)                           │
│  └── Database encryption at rest                                │
│                                                                  │
│  Layer 4: API Security                                           │
│  ├── CORS configuration                                         │
│  ├── Input validation                                           │
│  └── Error message sanitization                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

```
┌─────────────┐         ┌─────────────┐
│    User     │────1:N──│   Project   │
└─────────────┘         └─────────────┘
      │                        │
      │                        │
      │                   1:N  │
      │                        ▼
      │                 ┌─────────────┐
      │                 │  Subtitle   │
      │                 └─────────────┘
      │
      │
   1:N│
      │
      ▼
┌─────────────┐
│     Job     │
└─────────────┘

User Fields:
├── id (UUID)
├── email (unique)
├── passwordHash
├── name
├── planId → Plan
└── storageConfig (JSON)

Project Fields:
├── id (UUID)
├── userId → User
├── name
├── sourceVideoUrl
├── status
├── retentionDays
└── expiresAt

Subtitle Fields:
├── id (UUID)
├── projectId → Project
├── language
├── format (srt/ass)
├── content (text)
├── isOriginal
├── translationService
└── styling (font, color, position)

Job Fields:
├── id (UUID)
├── userId → User
├── projectId → Project
├── type (extract/translate/export)
├── status
├── progress
├── config (JSON)
└── resultUrl

Plan Fields:
├── id
├── name
├── maxProjects
├── maxVideoSizeMB
├── retentionDays
├── allowWatermark
└── translationQuota
```

## Scalability Considerations

### Horizontal Scaling

```
┌────────────────────────────────────────────────┐
│           Load Balancer (nginx)                │
└────────────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    ┌────────┐  ┌────────┐  ┌────────┐
    │ API #1 │  │ API #2 │  │ API #3 │
    └────────┘  └────────┘  └────────┘
         │           │           │
         └───────────┼───────────┘
                     ▼
         ┌──────────────────────┐
         │   Shared Database    │
         │   Shared Redis       │
         └──────────────────────┘
```

### Worker Scaling

```
Multiple worker instances can process jobs in parallel:

Worker 1 → Extract Jobs
Worker 2 → Export Jobs  } All connected to same Redis queue
Worker 3 → Any Jobs
```

### Storage Scaling

- Use CDN in front of R2/B2 for fast global delivery
- Implement storage quotas per user/plan
- Archive old projects to cold storage

## Technology Stack Summary

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | React + TypeScript + Vite | Modern SPA with type safety |
| Backend API | Express.js + Node.js | REST API server |
| Database | PostgreSQL + Prisma | Relational data storage |
| Job Queue | Redis + BullMQ | Background job processing |
| Video Processing | FFmpeg | Subtitle extraction, burning, muxing |
| Translation | OpenAI/DeepL/Gemini | AI-powered translation |
| Storage | Cloudflare R2 / Backblaze B2 | Object storage (S3-compatible) |
| State Management | Zustand | Frontend state |
| Data Fetching | TanStack Query | Server state management |
| Authentication | JWT + bcrypt | Secure user auth |

## Performance Optimizations

1. **Frontend**
   - Code splitting with React lazy loading
   - Optimistic UI updates
   - Cached query results with TanStack Query

2. **Backend**
   - Database connection pooling
   - Redis caching for frequently accessed data
   - Streaming large files instead of buffering

3. **Workers**
   - Parallel job processing
   - Job priority queues
   - Graceful shutdown handling

4. **Storage**
   - Presigned URLs eliminate API bottleneck
   - Direct client-to-storage upload
   - CDN for serving exported videos
