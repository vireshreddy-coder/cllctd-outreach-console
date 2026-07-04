export type LintInput = {
  subject?: string;
  body: string;
};

export type LintError = {
  id: string;
  message: string;
  match?: string;
};

const supplySideBlocked = 'ven' + 'dor';
const blockedPublicInboxes = ['buyers', 'investors', 'hello', supplySideBlocked + 's'];
const financeWords = ['fund' + 'raising', 'value' + 'ation', 'valued at', 'pre-money', 'post-money'];
const oldPlatformPattern = 'two[-\\s]?' + 'sided';
const oldMarketPattern = 'market' + 'place';
const oldVoicePattern = 'voice[-\\s]?' + 'first';
const longDash = String.fromCharCode(0x2014);
const oldPolicyAcronym = 'DP' + 'DP';
const oldHashPhrase = 'SHA' + '-256';
const oldConsentPhrase = 'consent ' + 'hash';

function getRestrictedTerms(): string[] {
  const raw = process.env.CLLCTD_RESTRICTED_TERMS || '';
  return raw
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstSentence(body: string) {
  const clean = body.trim().replace(/\s+/g, ' ');
  const match = clean.match(/^[^.!?]+[.!?]?/);
  return match ? match[0] : clean.slice(0, 220);
}

export function lintOutreachEmail(input: LintInput): { passed: boolean; errors: LintError[] } {
  const text = `${input.subject || ''}\n${input.body || ''}`;
  const body = input.body || '';
  const errors: LintError[] = [];
  const trimmed = body.trim();

  if (!trimmed.startsWith('Hey ')) {
    errors.push({ id: 'hey_opener', message: 'Open with Hey and the buyer name or team.' });
  }

  if (text.includes(longDash)) {
    errors.push({ id: 'long_dash', message: 'Remove long dash punctuation. Use short sentences.' });
  }

  for (const term of [oldPolicyAcronym, oldHashPhrase, oldConsentPhrase]) {
    const rx = new RegExp(escapeRegExp(term), 'i');
    const match = text.match(rx);
    if (match) {
      errors.push({ id: 'legacy_legal_wording', message: 'Remove old legal or hash wording.', match: match[0] });
    }
  }

  const lead = firstSentence(body);
  if (/\b(India|Indian)\b/i.test(lead)) {
    errors.push({ id: 'india_lead', message: 'Do not lead with India. Lead with the asset.' });
  }

  const legacyPositioningMatch = text.match(
    new RegExp(`\\b(${oldPlatformPattern}|${oldMarketPattern}|${oldVoicePattern})\\b`, 'i'),
  );
  if (legacyPositioningMatch) {
    errors.push({ id: 'legacy_positioning', message: 'Use the physical AI data-layer positioning.', match: legacyPositioningMatch[0] });
  }

  const tractionMatch = text.match(/\b(cllctd|we)\s+(has|have)?\s*delivered\b/i);
  if (tractionMatch) {
    errors.push({
      id: 'traction_framing',
      message: 'Historical delivery claims must be framed as team prior work.',
      match: tractionMatch[0],
    });
  }

  if (/\b(struggling|lack|lacks|missing|not enough|hard to|bottleneck|problem|gap|can'?t)\b/i.test(lead)) {
    errors.push({ id: 'gap_opener', message: 'Do not open by naming the buyer gap. Open with what cllctd has.' });
  }

  const supplySideRegex = new RegExp(`\\b${supplySideBlocked}s?\\b`, 'i');
  const supplySideMatch = text.match(supplySideRegex);
  if (supplySideMatch) {
    errors.push({ id: 'supply_side_word', message: 'Use contributor language for supply side.', match: supplySideMatch[0] });
  }

  const publicEmailMatch = text.match(new RegExp(`\\b(${blockedPublicInboxes.join('|')})\\s*@`, 'i'));
  if (publicEmailMatch) {
    errors.push({ id: 'public_email', message: 'Use team inbox for public-facing contact.', match: publicEmailMatch[0] });
  }

  const timingMatch = text.match(/\b(within\s+\d+\s*(h|hr|hrs|hour|hours|min|mins|minutes)|instant\w*|same\s+day)\b|\b(pay|paid|payment|cashout|cash out|earnings)\b.{0,60}\b(\d+\s*(h|hr|hrs|hour|hours|min|mins|minutes)|instant\w*|same\s+day)\b/i);
  if (timingMatch) {
    errors.push({ id: 'payment_timing', message: 'Do not promise payment timing. Use approval-based language only.', match: timingMatch[0] });
  }

  const splitMatch = text.match(/\b(70|30)\s*%|\b(70|30)\s*percent\b|\brevenue\s+split\b|\bsplit\s+revenue\b/i);
  if (splitMatch) {
    errors.push({ id: 'split_language', message: 'Remove split language and exact split numbers.', match: splitMatch[0] });
  }

  const financeMatch = text.match(
    new RegExp(`\\b(fund\\s*raise|${financeWords.map(escapeRegExp).join('|')})\\b`, 'i'),
  );
  if (financeMatch) {
    errors.push({ id: 'financing_claim', message: 'Remove financing or company-worth claims.', match: financeMatch[0] });
  }

  const fillerMatch = text.match(/\b(i hope this (email )?finds you well|circle back|touch base|synergy|leverage|game[-\s]?changer|revolutioni[sz]e|seamless|unlock value|world[-\s]?class)\b/i);
  if (fillerMatch) {
    errors.push({ id: 'corporate_filler', message: 'Remove corporate filler. Keep it plain.', match: fillerMatch[0] });
  }

  const restrictedTerms = getRestrictedTerms();
  for (const term of restrictedTerms) {
    const rx = new RegExp(escapeRegExp(term), 'i');
    const match = text.match(rx);
    if (match) {
      errors.push({ id: 'restricted_term', message: 'Restricted term found. Remove it before sending.', match: match[0] });
    }
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 140) {
    errors.push({ id: 'too_long', message: 'Keep the email under 140 words.', match: String(words.length) });
  }

  if (!/\bcllctd\b/i.test(text)) {
    errors.push({ id: 'missing_company', message: 'Mention cllctd once.' });
  }

  return { passed: errors.length === 0, errors };
}
