import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOutreachUser } from './_auth';
import { lintOutreachEmail } from '../src/lib/outreachLint';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireOutreachUser(req, res);
  if (!auth) return;

  const { subject = '', body = '' } = req.body || {};
  if (!body || typeof body !== 'string') {
    return res.status(400).json({ error: 'Missing body' });
  }

  const result = lintOutreachEmail({ subject, body });
  return res.status(200).json(result);
}
