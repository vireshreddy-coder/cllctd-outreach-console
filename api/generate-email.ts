import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOutreachUser } from './_auth';
import { buildOutreachPrompt } from '../src/lib/outreachPrompt';
import { lintOutreachEmail } from '../src/lib/outreachLint';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireOutreachUser(req, res);
  if (!auth) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing server API key' });
  }

  const {
    buyerName,
    category,
    context,
    assets,
    sampleLink,
    cta = 'Worth a look?',
    signoff = 'V',
  } = req.body || {};

  if (!buyerName || !category || !context || !assets) {
    return res.status(400).json({ error: 'Missing required draft inputs' });
  }

  const prompt = buildOutreachPrompt({ buyerName, category, context, assets, sampleLink, cta, signoff });

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 450,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return res.status(upstream.status).json({ error: 'Draft generation failed', detail: text.slice(0, 500) });
  }

  const json = await upstream.json();
  const body = json?.content?.[0]?.text?.trim() || '';
  const subject = `cllctd data for ${buyerName}`;
  const lint = lintOutreachEmail({ subject, body });

  return res.status(200).json({ subject, body, lint });
}
