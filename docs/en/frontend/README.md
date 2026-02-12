# Frontend Documentation (EN)

This document explains the architecture and runtime model of the `frontend/` application.

## 1. Technology Summary

- Next.js 16 (App Router)
- React 19
- TypeScript
- TailwindCSS v4
- Supabase SSR (`@supabase/ssr`)
- shadcn/ui-based component set

## 2. Folder Structure

Core directories:
- `frontend/src/app/`: route segments
- `frontend/src/components/`: UI and layout components
- `frontend/src/hooks/`: custom hooks
- `frontend/src/lib/`: API client, supabase clients, utilities
- `frontend/src/middleware.ts`: auth and route guards

Route groups:
- `(marketing)`
- `(auth)`
- `(app)`
- `(admin)`

## 3. Auth and Session Flow

Auth stack:
- browser client (`lib/supabase/client.ts`)
- server client (`lib/supabase/server.ts`)
- middleware-driven session refresh

`middleware.ts` behavior:
- enforces auth for protected routes
- enforces admin role checks for admin routes
- redirects logged-in users away from login/register

## 4. Backend Communication

API layer:
- `frontend/src/lib/api.ts`

Core behavior:
- uses `NEXT_PUBLIC_API_URL` as base URL
- reads access token from Supabase session
- injects `Authorization: Bearer <token>`

Covered API groups:
- projects
- translation
- export
- glossary
- health

Error handling:
- throws `ApiError` when response is not ok.

## 5. Main User Flows

### 5.1 Upload Flow
1. User uploads video or subtitle.
2. Backend creates project.
3. Frontend tracks project status.

### 5.2 Translation Flow
1. Frontend creates translation job.
2. Frontend polls by job id.
3. On `completed`, user proceeds to editor/export.

### 5.3 Editor Flow
1. Subtitle lines are fetched.
2. User edits lines inline.
3. Batch update endpoint saves changes.

### 5.4 Export Flow
1. User chooses export options.
2. Frontend creates export job.
3. Download URL is shown after completion.

## 6. UI Layer

UI composition:
- shared UI components under `components/ui/*`
- layout components such as sidebars and providers
- theme/font customization components

State updates:
- polling for long-running jobs
- toast notifications via `sonner`

## 7. Environment Variables

Required frontend variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`

Important note:
- `NEXT_PUBLIC_*` values are baked into the JS bundle at build time.
- changing domains requires rebuild.

## 8. Build and Runtime

`frontend/Dockerfile` highlights:
- multi-stage build
- `output: standalone` optimized runtime
- runtime command: `node server.js`
- container port: `3000`

Coolify domain mapping:
- `subtranslate.syrins.tech:3000`

## 9. Frontend Development

Local setup:
1. `npm install`
2. create `.env.local`
3. run `npm run dev`

Implementation guidance:
- route all API calls through `lib/api.ts`
- keep auth enforcement in middleware
- separate side effects into hooks

## 10. Common Issues

Blank page / env mismatch:
- missing or wrong `NEXT_PUBLIC_*` values.

401 errors:
- missing Supabase session or wrong backend URL.

CORS errors:
- backend `CORS_ORIGINS` must match frontend domain exactly.

Polling issues:
- verify backend job endpoints and worker logs.

