import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOutreachUser } from './_auth';
import { lintOutreachEmail } from '../src/lib/outreachLint';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireOutreachUser(req, res);
  if (!auth) return;

  const { targetId, draftId, subject, body, sender } = req.body || {};
  if (!targetId || !subject || !body || !sender) {
    return res.status(400).json({ error: 'Missing required send log fields' });
  }

  const lint = lintOutreachEmail({ subject, body });
  if (!lint.passed) {
    return res.status(422).json({ error: 'Draft failed lint', lint });
  }

  const supabase = auth.supabase;
  const { error: insertError } = await supabase.from('sent_log').insert({
    target_id: targetId,
    draft_id: draftId || null,
    subject,
    body,
    sender,
    send_mode: 'manual',
    status: 'sent',
  });

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  const { error: updateError } = await supabase
    .from('targets')
    .update({ status: 'sent', last_contacted_at: new Date().toISOString() })
    .eq('id', targetId);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  await supabase.from('activity').insert({ text: `Marked sent: ${subject}`, type: 'send', actor_email: auth.email });
  return res.status(200).json({ ok: true });
}
