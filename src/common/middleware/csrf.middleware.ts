import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import csurf from 'csurf';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private csurfInstance = csurf({
    cookie: {
      key: 'XSRF-TOKEN',
      httpOnly: false, // Must be false so frontend can read it
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    },
    value: (req: Request) => req.headers['x-xsrf-token'] as string,
  });

  use(req: Request, res: Response, next: NextFunction) {

    const userAgent = req.headers['user-agent'] || '';
    if (
      userAgent.includes('Expo') || 
      userAgent.includes('Darwin') || 
      userAgent.includes('okhttp')
    ) {
      return next();
    }

    // Exclude login, register, and refresh from CSRF verification
    const ignoredPaths = [
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/auth/refresh',
      '/api/v1/auth/logout',
    ];

    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    if (
      ignoredPaths.some((p) => req.originalUrl.startsWith(p)) ||
      req.originalUrl.startsWith('/admin') ||
      req.originalUrl.startsWith('/api/v1/admin')
    ) {
      return next();
    }

    this.csurfInstance(req, res, next);
  }
}
