import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isStudioPasswordRequired,
  verifyStudioPassword,
  createStudioSessionToken,
  isRequestStudioAuthenticated,
  buildSessionCookieHeader,
  buildClearSessionCookieHeader,
  extractClientIp,
  checkAuthRateLimit,
  recordAuthFailure,
  clearAuthFailures,
} from '../src/server/studioAuth.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const passwordRequired = isStudioPasswordRequired();

  if (req.method === 'GET') {
    const authenticated = isRequestStudioAuthenticated(req.headers);
    return res.status(200).json({ passwordRequired, authenticated });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', buildClearSessionCookieHeader());
    return res.status(200).json({ authenticated: false, passwordRequired });
  }

  if (req.method === 'POST') {
    if (!passwordRequired) {
      return res.status(200).json({ authenticated: true, passwordRequired: false, token: '' });
    }

    const clientIp = extractClientIp(req.headers, req.socket?.remoteAddress);
    const rateCheck = checkAuthRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
      return res.status(429).json({
        authenticated: false,
        passwordRequired: true,
        error: `Trop de tentatives. Réessayez dans ${rateCheck.retryAfterSeconds} s.`,
      });
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!verifyStudioPassword(password)) {
      const failure = recordAuthFailure(clientIp);
      if (!failure.allowed) {
        res.setHeader('Retry-After', String(failure.retryAfterSeconds));
        return res.status(429).json({
          authenticated: false,
          passwordRequired: true,
          error: `Trop de tentatives. Réessayez dans ${failure.retryAfterSeconds} s.`,
        });
      }
      return res.status(401).json({
        authenticated: false,
        passwordRequired: true,
        error: 'Mot de passe incorrect.',
      });
    }

    clearAuthFailures(clientIp);
    const token = createStudioSessionToken();
    res.setHeader('Set-Cookie', buildSessionCookieHeader(token));
    return res.status(200).json({
      authenticated: true,
      passwordRequired: true,
      token,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
