import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isStudioPasswordRequired,
  verifyStudioPassword,
  createStudioSessionToken,
  isRequestStudioAuthenticated,
  buildSessionCookieHeader,
  buildClearSessionCookieHeader,
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

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!verifyStudioPassword(password)) {
      return res.status(401).json({
        authenticated: false,
        passwordRequired: true,
        error: 'Mot de passe incorrect.',
      });
    }

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
