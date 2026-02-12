import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { createJob } from '../services/jobQueue';

const router = Router();

// Get all jobs for user
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { userId: req.userId },
      include: { project: true },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json(jobs);
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get single job
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const job = await prisma.job.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
      include: { project: true },
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Create export job
router.post('/export', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      projectId,
      subtitleId,
      outputFormat,
      burnSubtitles,
      watermark,
      watermarkText,
      audioTracks,
    } = req.body;
    
    if (!projectId || !subtitleId) {
      return res.status(400).json({ error: 'projectId and subtitleId required' });
    }
    
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: req.userId,
      },
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const job = await createJob({
      userId: req.userId!,
      projectId,
      type: 'export',
      config: {
        subtitleId,
        outputFormat: outputFormat || 'mp4',
        burnSubtitles: burnSubtitles || false,
        watermark: watermark || false,
        watermarkText,
        audioTracks: audioTracks || [],
      },
    });
    
    res.status(201).json(job);
  } catch (error) {
    console.error('Create export job error:', error);
    res.status(500).json({ error: 'Failed to create export job' });
  }
});

export default router;
