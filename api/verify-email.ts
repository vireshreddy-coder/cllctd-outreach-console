import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOutreachUser } from './_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireOutreachUser(req, res);
  if (!auth) return;

  return res.status(200).json({
    ok: true,
    status: 'not_configured',
    message: 'Email verification is reserved for the next outreach stage.',
  });
}
