import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../index';

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.userId = user.id;
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const checkPlanLimit = (limitType: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      // Get plan details
      const plan = await prisma.plan.findUnique({
        where: { id: user.planId },
      });
      
      if (!plan) {
        return res.status(403).json({ error: 'Invalid plan' });
      }
      
      // Check specific limits
      if (limitType === 'projects') {
        const projectCount = await prisma.project.count({
          where: { userId: user.id },
        });
        
        if (projectCount >= plan.maxProjects) {
          return res.status(403).json({
            error: 'Project limit reached',
            limit: plan.maxProjects,
            current: projectCount,
          });
        }
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};
