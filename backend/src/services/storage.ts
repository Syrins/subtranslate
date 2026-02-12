import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import crypto from 'crypto';

// Cloudflare R2 client
function getR2Client() {
  if (!config.r2AccountId || !config.r2AccessKeyId || !config.r2SecretAccessKey) {
    throw new Error('R2 credentials not configured');
  }
  
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });
}

// Backblaze B2 client
function getB2Client() {
  if (!config.b2KeyId || !config.b2ApplicationKey) {
    throw new Error('B2 credentials not configured');
  }
  
  return new S3Client({
    region: 'us-west-002', // B2 uses this region format
    endpoint: 'https://s3.us-west-002.backblazeb2.com',
    credentials: {
      accessKeyId: config.b2KeyId,
      secretAccessKey: config.b2ApplicationKey,
    },
  });
}

// Generate presigned upload URL
export async function generateUploadUrl(
  storageType: 'r2' | 'b2',
  fileName: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<{ uploadUrl: string; key: string }> {
  const key = `uploads/${crypto.randomUUID()}/${fileName}`;
  
  const client = storageType === 'r2' ? getR2Client() : getB2Client();
  const bucketName = storageType === 'r2' ? config.r2BucketName : config.b2BucketName;
  
  if (!bucketName) {
    throw new Error(`${storageType.toUpperCase()} bucket not configured`);
  }
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });
  
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  
  return { uploadUrl, key };
}

// Generate presigned download URL
export async function generateDownloadUrl(
  storageType: 'r2' | 'b2',
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const client = storageType === 'r2' ? getR2Client() : getB2Client();
  const bucketName = storageType === 'r2' ? config.r2BucketName : config.b2BucketName;
  
  if (!bucketName) {
    throw new Error(`${storageType.toUpperCase()} bucket not configured`);
  }
  
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  
  return await getSignedUrl(client, command, { expiresIn });
}

// Get public URL (for R2 with public access)
export function getPublicUrl(storageType: 'r2' | 'b2', key: string): string {
  if (storageType === 'r2' && config.r2PublicUrl) {
    return `${config.r2PublicUrl}/${key}`;
  }
  
  throw new Error('Public URL not available for this storage type');
}
