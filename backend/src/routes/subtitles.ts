import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { translateSubtitle } from '../services/translation';

const router = Router();

// Get subtitles for a project
router.get('/project/:projectId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.projectId,
        userId: req.userId,
      },
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const subtitles = await prisma.subtitle.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json(subtitles);
  } catch (error) {
    console.error('Get subtitles error:', error);
    res.status(500).json({ error: 'Failed to fetch subtitles' });
  }
});

// Get single subtitle
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const subtitle = await prisma.subtitle.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });
    
    if (!subtitle || subtitle.project.userId !== req.userId) {
      return res.status(404).json({ error: 'Subtitle not found' });
    }
    
    res.json(subtitle);
  } catch (error) {
    console.error('Get subtitle error:', error);
    res.status(500).json({ error: 'Failed to fetch subtitle' });
  }
});

// Create subtitle
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      projectId,
      language,
      format,
      content,
      isOriginal,
      fontFamily,
      fontSize,
      fontColor,
      outlineColor,
      outlineWidth,
      positionX,
      positionY,
    } = req.body;
    
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: req.userId,
      },
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const subtitle = await prisma.subtitle.create({
      data: {
        projectId,
        language,
        format: format || 'srt',
        content,
        isOriginal: isOriginal || false,
        fontFamily,
        fontSize,
        fontColor,
        outlineColor,
        outlineWidth,
        positionX,
        positionY,
      },
    });
    
    res.status(201).json(subtitle);
  } catch (error) {
    console.error('Create subtitle error:', error);
    res.status(500).json({ error: 'Failed to create subtitle' });
  }
});

// Update subtitle
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const subtitle = await prisma.subtitle.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });
    
    if (!subtitle || subtitle.project.userId !== req.userId) {
      return res.status(404).json({ error: 'Subtitle not found' });
    }
    
    const updated = await prisma.subtitle.update({
      where: { id: req.params.id },
      data: req.body,
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Update subtitle error:', error);
    res.status(500).json({ error: 'Failed to update subtitle' });
  }
});

// Translate subtitle
router.post('/:id/translate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { targetLanguage, service } = req.body;
    
    if (!targetLanguage || !service) {
      return res.status(400).json({ error: 'Target language and service required' });
    }
    
    const subtitle = await prisma.subtitle.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });
    
    if (!subtitle || subtitle.project.userId !== req.userId) {
      return res.status(404).json({ error: 'Subtitle not found' });
    }
    
    // Translate the subtitle
    const translatedContent = await translateSubtitle(
      subtitle.content,
      subtitle.language,
      targetLanguage,
      service
    );
    
    // Create new subtitle with translation
    const translated = await prisma.subtitle.create({
      data: {
        projectId: subtitle.projectId,
        language: targetLanguage,
        format: subtitle.format,
        content: translatedContent,
        isOriginal: false,
        translatedFrom: subtitle.id,
        translationService: service,
        fontFamily: subtitle.fontFamily,
        fontSize: subtitle.fontSize,
        fontColor: subtitle.fontColor,
        outlineColor: subtitle.outlineColor,
        outlineWidth: subtitle.outlineWidth,
        positionX: subtitle.positionX,
        positionY: subtitle.positionY,
      },
    });
    
    res.status(201).json(translated);
  } catch (error) {
    console.error('Translate subtitle error:', error);
    res.status(500).json({ error: 'Failed to translate subtitle' });
  }
});

// Delete subtitle
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const subtitle = await prisma.subtitle.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });
    
    if (!subtitle || subtitle.project.userId !== req.userId) {
      return res.status(404).json({ error: 'Subtitle not found' });
    }
    
    await prisma.subtitle.delete({
      where: { id: req.params.id },
    });
    
    res.json({ message: 'Subtitle deleted' });
  } catch (error) {
    console.error('Delete subtitle error:', error);
    res.status(500).json({ error: 'Failed to delete subtitle' });
  }
});

export default router;
