import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/subtranslate',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  
  // Redis
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD,
  
  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY,
  
  // DeepL
  deeplApiKey: process.env.DEEPL_API_KEY,
  
  // Google Gemini
  geminiApiKey: process.env.GEMINI_API_KEY,
  
  // Cloudflare R2
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  r2BucketName: process.env.R2_BUCKET_NAME,
  r2PublicUrl: process.env.R2_PUBLIC_URL,
  
  // Backblaze B2
  b2KeyId: process.env.B2_KEY_ID,
  b2ApplicationKey: process.env.B2_APPLICATION_KEY,
  b2BucketName: process.env.B2_BUCKET_NAME,
  b2BucketId: process.env.B2_BUCKET_ID,
  
  // File upload
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10) * 1024 * 1024,
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  
  // FFmpeg
  ffmpegPath: process.env.FFMPEG_PATH,
  ffprobePath: process.env.FFPROBE_PATH,
};
