import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { generateUploadUrl, generateDownloadUrl } from '../services/storage';

const router = Router();

// Get presigned upload URL
router.post('/upload-url', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { fileName, contentType, storageType } = req.body;
    
    if (!fileName || !contentType || !storageType) {
      return res.status(400).json({
        error: 'fileName, contentType, and storageType required',
      });
    }
    
    if (storageType !== 'r2' && storageType !== 'b2') {
      return res.status(400).json({
        error: 'storageType must be "r2" or "b2"',
      });
    }
    
    const result = await generateUploadUrl(storageType, fileName, contentType);
    
    res.json(result);
  } catch (error) {
    console.error('Generate upload URL error:', error);
    res.status(500).json({
      error: 'Failed to generate upload URL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get presigned download URL
router.post('/download-url', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { key, storageType } = req.body;
    
    if (!key || !storageType) {
      return res.status(400).json({
        error: 'key and storageType required',
      });
    }
    
    if (storageType !== 'r2' && storageType !== 'b2') {
      return res.status(400).json({
        error: 'storageType must be "r2" or "b2"',
      });
    }
    
    const downloadUrl = await generateDownloadUrl(storageType, key);
    
    res.json({ downloadUrl });
  } catch (error) {
    console.error('Generate download URL error:', error);
    res.status(500).json({
      error: 'Failed to generate download URL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
