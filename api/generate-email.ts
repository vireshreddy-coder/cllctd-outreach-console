import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOutreachUser } from './_auth';
import { buildOutreachPrompt } from '../src/lib/outreachPrompt';
import { lintOutreachEmail } from '../src/lib/outreachLint';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireOutreachUser(req, res);
  if (!auth) return;

  const apiKey = process.env.OPENAI_API_KEY;
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

  const upstream = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      max_tokens: 450,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: 'You write only compliant cllctd outreach email bodies. Return plain text only.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return res.status(upstream.status).json({ error: 'Draft generation failed', detail: text.slice(0, 500) });
  }

  const json = await upstream.json();
  const body = json?.choices?.[0]?.message?.content?.trim() || '';
  const subject = `cllctd data for ${buyerName}`;
  const lint = lintOutreachEmail({ subject, body });

  return res.status(200).json({ subject, body, lint });
}
