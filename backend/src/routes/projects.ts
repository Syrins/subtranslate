import { Router, Response } from 'express';
import { authenticate, checkPlanLimit, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { createJob } from '../services/jobQueue';

const router = Router();

// Get all projects for user
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.userId },
      include: {
        subtitles: true,
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json(projects);
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
      include: {
        subtitles: true,
        jobs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create project
router.post('/', authenticate, checkPlanLimit('projects'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, sourceVideoUrl, sourceVideoType } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Project name required' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });
    
    const plan = await prisma.plan.findUnique({
      where: { id: user!.planId },
    });
    
    const project = await prisma.project.create({
      data: {
        userId: req.userId!,
        name,
        sourceVideoUrl,
        sourceVideoType,
        retentionDays: plan?.retentionDays || 30,
        expiresAt: new Date(Date.now() + (plan?.retentionDays || 30) * 24 * 60 * 60 * 1000),
      },
    });
    
    // If video URL provided, create extraction job
    if (sourceVideoUrl) {
      await createJob({
        userId: req.userId!,
        projectId: project.id,
        type: 'extract',
        config: {
          videoUrl: sourceVideoUrl,
        },
      });
    }
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, sourceVideoUrl } = req.body;
    
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(sourceVideoUrl && { sourceVideoUrl }),
      },
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    await prisma.project.delete({
      where: { id: req.params.id },
    });
    
    res.json({ message: 'Project deleted' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
