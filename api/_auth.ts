import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const allowedEmails = new Set(['viresh@cllctd.ai', 'tarun@cllctd.ai']);

function getBearer(req: VercelRequest) {
  const header = req.headers.authorization || '';
  const [kind, token] = header.split(' ');
  return kind?.toLowerCase() === 'bearer' ? token : '';
}

export async function requireOutreachUser(req: VercelRequest, res: VercelResponse) {
  const token = getBearer(req);
  if (!token) {
    res.status(401).json({ error: 'Missing session' });
    return null;
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.status(500).json({ error: 'Missing Supabase server env' });
    return null;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.toLowerCase() || '';
  if (error || !allowedEmails.has(email)) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }

  return { supabase, user: data.user, email };
}
