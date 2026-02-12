import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config';
import { prisma } from '../index';
import IORedis from 'ioredis';

const connection = new IORedis({
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
  maxRetriesPerRequest: null,
});

export const jobQueue = new Queue('subtranslate', { connection });

interface JobData {
  userId: string;
  projectId?: string;
  type: 'extract' | 'translate' | 'export';
  config: any;
}

export async function createJob(data: JobData) {
  // Create job in database
  const dbJob = await prisma.job.create({
    data: {
      userId: data.userId,
      projectId: data.projectId,
      type: data.type,
      status: 'pending',
      config: data.config,
    },
  });
  
  // Add to queue
  await jobQueue.add(data.type, {
    ...data,
    jobId: dbJob.id,
  });
  
  return dbJob;
}

export async function updateJobProgress(jobId: string, progress: number, status?: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      progress,
      ...(status && { status }),
    },
  });
}

export async function completeJob(jobId: string, resultUrl?: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      progress: 100,
      resultUrl,
      completedAt: new Date(),
    },
  });
}

export async function failJob(jobId: string, error: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      error,
      completedAt: new Date(),
    },
  });
}
