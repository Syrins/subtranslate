import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';
import { prisma } from '../index';
import {
  updateJobProgress,
  completeJob,
  failJob,
} from '../services/jobQueue';
import {
  extractSubtitles,
  burnSubtitles,
  addWatermark,
  exportWithSoftSubs,
} from '../services/video';
import { generateDownloadUrl } from '../services/storage';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const connection = new IORedis({
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
  maxRetriesPerRequest: null,
});

// Extract subtitle job handler
async function handleExtractJob(job: any) {
  const { jobId, projectId, config: jobConfig } = job.data;
  
  try {
    await updateJobProgress(jobId, 10, 'processing');
    
    // Download video if needed
    const videoUrl = jobConfig.videoUrl;
    const videoPath = path.join(config.uploadDir, `${crypto.randomUUID()}.mkv`);
    
    // For demo, assume video is already downloaded or accessible
    await updateJobProgress(jobId, 30);
    
    // Extract subtitles
    const outputDir = path.join(config.uploadDir, crypto.randomUUID());
    await fs.mkdir(outputDir, { recursive: true });
    
    const subtitles = await extractSubtitles(videoPath, outputDir);
    
    await updateJobProgress(jobId, 70);
    
    // Save subtitles to database
    for (const subtitle of subtitles) {
      const content = await fs.readFile(subtitle.path, 'utf-8');
      
      await prisma.subtitle.create({
        data: {
          projectId,
          language: subtitle.language,
          format: subtitle.format,
          content,
          isOriginal: true,
        },
      });
    }
    
    await updateJobProgress(jobId, 90);
    
    // Update project status
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'completed' },
    });
    
    // Cleanup
    await fs.rm(outputDir, { recursive: true, force: true });
    
    await completeJob(jobId);
  } catch (error) {
    console.error('Extract job failed:', error);
    await failJob(jobId, error instanceof Error ? error.message : 'Unknown error');
  }
}

// Export job handler
async function handleExportJob(job: any) {
  const { jobId, projectId, config: jobConfig } = job.data;
  
  try {
    await updateJobProgress(jobId, 10, 'processing');
    
    // Get project and subtitle
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    
    const subtitle = await prisma.subtitle.findUnique({
      where: { id: jobConfig.subtitleId },
    });
    
    if (!project || !subtitle) {
      throw new Error('Project or subtitle not found');
    }
    
    await updateJobProgress(jobId, 20);
    
    // Write subtitle to temp file
    const subtitlePath = path.join(config.uploadDir, `${crypto.randomUUID()}.${subtitle.format}`);
    await fs.writeFile(subtitlePath, subtitle.content);
    
    const videoPath = project.sourceVideoUrl || '';
    const outputPath = path.join(config.uploadDir, `output_${crypto.randomUUID()}.mp4`);
    
    await updateJobProgress(jobId, 30);
    
    // Process video based on config
    if (jobConfig.burnSubtitles) {
      // Burn subtitles into video
      await burnSubtitles(videoPath, subtitlePath, outputPath, (progress) => {
        updateJobProgress(jobId, 30 + Math.round(progress * 0.5));
      });
    } else {
      // Export with soft subtitles
      await exportWithSoftSubs(
        videoPath,
        subtitlePath,
        outputPath,
        jobConfig.audioTracks
      );
    }
    
    await updateJobProgress(jobId, 80);
    
    // Add watermark if requested
    if (jobConfig.watermark && jobConfig.watermarkText) {
      const watermarkedPath = path.join(config.uploadDir, `watermarked_${crypto.randomUUID()}.mp4`);
      await addWatermark(outputPath, jobConfig.watermarkText, watermarkedPath);
      await fs.unlink(outputPath);
      await fs.rename(watermarkedPath, outputPath);
    }
    
    await updateJobProgress(jobId, 90);
    
    // Upload to storage (placeholder - would upload to R2/B2)
    // For demo, just generate a local path
    const resultUrl = `/uploads/${path.basename(outputPath)}`;
    
    // Cleanup subtitle file
    await fs.unlink(subtitlePath);
    
    await completeJob(jobId, resultUrl);
  } catch (error) {
    console.error('Export job failed:', error);
    await failJob(jobId, error instanceof Error ? error.message : 'Unknown error');
  }
}

// Create worker
const worker = new Worker(
  'subtranslate',
  async (job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`);
    
    switch (job.name) {
      case 'extract':
        await handleExtractJob(job);
        break;
      case 'export':
        await handleExportJob(job);
        break;
      default:
        console.log(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 2,
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

console.log('Worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker...');
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});
