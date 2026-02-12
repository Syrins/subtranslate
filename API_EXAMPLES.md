# API Examples

This document provides practical examples of using the SubTranslate API.

## Authentication

### Register a New User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "name": "John Doe"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "name": "John Doe",
    "planId": "free"
  }
}
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

## Projects

### Create a New Project

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Anime Project",
    "sourceVideoUrl": "https://example.com/episode1.mkv"
  }'
```

Response:
```json
{
  "id": "project-uuid",
  "userId": "user-uuid",
  "name": "My Anime Project",
  "sourceVideoUrl": "https://example.com/episode1.mkv",
  "sourceVideoType": null,
  "status": "created",
  "retentionDays": 30,
  "expiresAt": "2024-02-11T00:00:00.000Z",
  "createdAt": "2024-01-12T00:00:00.000Z",
  "updatedAt": "2024-01-12T00:00:00.000Z"
}
```

### List All Projects

```bash
curl http://localhost:3000/api/projects \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Project Details

```bash
curl http://localhost:3000/api/projects/{project-id} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Update Project

```bash
curl -X PATCH http://localhost:3000/api/projects/{project-id} \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Project Name"
  }'
```

### Delete Project

```bash
curl -X DELETE http://localhost:3000/api/projects/{project-id} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Subtitles

### Get Subtitles for a Project

```bash
curl http://localhost:3000/api/subtitles/project/{project-id} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create a New Subtitle

```bash
curl -X POST http://localhost:3000/api/subtitles \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "project-uuid",
    "language": "English",
    "format": "srt",
    "content": "1\n00:00:01,000 --> 00:00:03,000\nHello World\n\n2\n00:00:04,000 --> 00:00:06,000\nSubtitle translation demo",
    "isOriginal": true,
    "fontFamily": "Arial",
    "fontSize": 24,
    "fontColor": "#FFFFFF",
    "outlineColor": "#000000",
    "outlineWidth": 2
  }'
```

### Update Subtitle

```bash
curl -X PATCH http://localhost:3000/api/subtitles/{subtitle-id} \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Updated subtitle content",
    "fontSize": 28
  }'
```

### Translate Subtitle

```bash
# Using OpenAI
curl -X POST http://localhost:3000/api/subtitles/{subtitle-id}/translate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetLanguage": "Spanish",
    "service": "openai"
  }'

# Using DeepL
curl -X POST http://localhost:3000/api/subtitles/{subtitle-id}/translate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetLanguage": "Japanese",
    "service": "deepl"
  }'

# Using Gemini
curl -X POST http://localhost:3000/api/subtitles/{subtitle-id}/translate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetLanguage": "French",
    "service": "gemini"
  }'
```

## Storage

### Get Presigned Upload URL

```bash
curl -X POST http://localhost:3000/api/storage/upload-url \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "my-video.mkv",
    "contentType": "video/x-matroska",
    "storageType": "r2"
  }'
```

Response:
```json
{
  "uploadUrl": "https://account.r2.cloudflarestorage.com/subtranslate/uploads/uuid/my-video.mkv?...",
  "key": "uploads/uuid/my-video.mkv"
}
```

Then upload directly to the presigned URL:
```bash
curl -X PUT "PRESIGNED_UPLOAD_URL" \
  -H "Content-Type: video/x-matroska" \
  --data-binary @my-video.mkv
```

### Get Presigned Download URL

```bash
curl -X POST http://localhost:3000/api/storage/download-url \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "uploads/uuid/my-video.mkv",
    "storageType": "r2"
  }'
```

Response:
```json
{
  "downloadUrl": "https://account.r2.cloudflarestorage.com/subtranslate/uploads/uuid/my-video.mkv?..."
}
```

## Jobs

### List All Jobs

```bash
curl http://localhost:3000/api/jobs \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Job Details

```bash
curl http://localhost:3000/api/jobs/{job-id} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create Export Job

```bash
# Export with burned-in subtitles and watermark
curl -X POST http://localhost:3000/api/jobs/export \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "project-uuid",
    "subtitleId": "subtitle-uuid",
    "outputFormat": "mp4",
    "burnSubtitles": true,
    "watermark": true,
    "watermarkText": "MyChannel.com",
    "audioTracks": [0, 1]
  }'

# Export with soft subtitles (no watermark)
curl -X POST http://localhost:3000/api/jobs/export \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "project-uuid",
    "subtitleId": "subtitle-uuid",
    "outputFormat": "mp4",
    "burnSubtitles": false,
    "watermark": false
  }'
```

Response:
```json
{
  "id": "job-uuid",
  "userId": "user-uuid",
  "projectId": "project-uuid",
  "type": "export",
  "status": "pending",
  "progress": 0,
  "config": {
    "subtitleId": "subtitle-uuid",
    "outputFormat": "mp4",
    "burnSubtitles": true,
    "watermark": true,
    "watermarkText": "MyChannel.com"
  },
  "createdAt": "2024-01-12T00:00:00.000Z",
  "updatedAt": "2024-01-12T00:00:00.000Z"
}
```

## Complete Workflow Example

### 1. Register and Login

```bash
# Register
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "translator@example.com",
    "password": "mypassword",
    "name": "Translator"
  }' | jq -r '.token')

echo "Token: $TOKEN"
```

### 2. Create a Project

```bash
PROJECT_ID=$(curl -s -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Episode 1 Translation",
    "sourceVideoUrl": "https://example.com/episode1.mkv"
  }' | jq -r '.id')

echo "Project ID: $PROJECT_ID"
```

### 3. Add Original Subtitle

```bash
SUBTITLE_ID=$(curl -s -X POST http://localhost:3000/api/subtitles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"$PROJECT_ID\",
    \"language\": \"Japanese\",
    \"format\": \"srt\",
    \"content\": \"1\n00:00:01,000 --> 00:00:03,000\nこんにちは世界\n\n2\n00:00:04,000 --> 00:00:06,000\n字幕翻訳デモ\",
    \"isOriginal\": true
  }" | jq -r '.id')

echo "Subtitle ID: $SUBTITLE_ID"
```

### 4. Translate to English

```bash
TRANSLATED_ID=$(curl -s -X POST http://localhost:3000/api/subtitles/$SUBTITLE_ID/translate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetLanguage": "English",
    "service": "openai"
  }' | jq -r '.id')

echo "Translated Subtitle ID: $TRANSLATED_ID"
```

### 5. Export Video with Subtitles

```bash
JOB_ID=$(curl -s -X POST http://localhost:3000/api/jobs/export \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"$PROJECT_ID\",
    \"subtitleId\": \"$TRANSLATED_ID\",
    \"burnSubtitles\": true,
    \"watermark\": true,
    \"watermarkText\": \"MyFansubs\"
  }" | jq -r '.id')

echo "Export Job ID: $JOB_ID"
```

### 6. Check Job Status

```bash
# Poll job status
while true; do
  STATUS=$(curl -s http://localhost:3000/api/jobs/$JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq -r '.status')
  PROGRESS=$(curl -s http://localhost:3000/api/jobs/$JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq -r '.progress')
  
  echo "Job Status: $STATUS ($PROGRESS%)"
  
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  
  sleep 5
done

# Get result URL
RESULT_URL=$(curl -s http://localhost:3000/api/jobs/$JOB_ID \
  -H "Authorization: Bearer $TOKEN" | jq -r '.resultUrl')

echo "Download your video: $RESULT_URL"
```

## Error Handling

All endpoints return standard HTTP status codes:

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Plan limit exceeded or insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

Error response format:
```json
{
  "error": "Error message here",
  "message": "Detailed error message (development only)"
}
```

## Rate Limiting

Currently, there's no rate limiting implemented. For production, consider adding rate limiting middleware.

## Pagination

List endpoints (projects, jobs) support pagination through query parameters:

```bash
curl "http://localhost:3000/api/projects?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Note: Pagination is not yet fully implemented but the structure supports it.
