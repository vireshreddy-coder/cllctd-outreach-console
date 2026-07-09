import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOutreachUser } from './_auth.js';
import { lintOutreachEmail } from '../src/lib/outreachLint.js';

type DraftInput = {
  buyerName: string;
  category: string;
  assets: string;
  sampleLink?: string;
  cta: string;
  signoff: string;
};

function cleanSentence(value: unknown, fallback: string) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
  return (text || fallback).replace(/[.!?]+$/g, '');
}

function buyerGreeting(name: string) {
  const clean = cleanSentence(name, 'there');
  return `${clean} team`;
}

function buildTemplateDraft(input: DraftInput) {
  const category = cleanSentence(input.category, 'physical AI teams').toLowerCase();
  const assets = cleanSentence(
    input.assets,
    'rights-cleared first-person task video from contributor-captured real-world work',
  );
  const sample = cleanSentence(input.sampleLink, 'sample reel available on request').toLowerCase();

  return [
    `Hey ${buyerGreeting(input.buyerName)},`,
    '',
    `cllctd has rights-cleared first-person task video for ${category}.`,
    `The current cut covers ${assets}.`,
    'Each package is contributor-captured, reviewed, and prepared for commercial AI training use.',
    `We can share a ${sample} if useful.`,
    '',
    input.cta,
    '',
    input.signoff,
  ].join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireOutreachUser(req, res);
  if (!auth) return;

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

  const body = buildTemplateDraft({ buyerName, category, assets, sampleLink, cta, signoff });
  const subject = `cllctd data for ${buyerName}`;
  const lint = lintOutreachEmail({ subject, body });

  return res.status(200).json({ subject, body, lint });
}
