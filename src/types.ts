export type Sender = 'viresh' | 'tarun';
export type TargetStatus = 'new' | 'queued' | 'drafted' | 'sent' | 'replied' | 'bounced' | 'dead';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export type Target = {
  id: string;
  name: string;
  email: string | null;
  website_url: string | null;
  contact_url: string | null;
  category: string;
  segment: string | null;
  priority: Priority;
  status: TargetStatus;
  context: string | null;
  notes: string | null;
  buyer_angle: string | null;
  asset_to_pitch: string | null;
  sender: Sender;
  source: string;
  source_url: string | null;
  fit_score: number | null;
  email_verification_status: string;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Draft = {
  id: string;
  target_id: string;
  subject: string;
  body: string;
  sender: Sender;
  status: 'draft' | 'queued' | 'sent' | 'blocked';
  lint_passed: boolean;
  lint_errors: LintIssue[];
  created_at: string;
  updated_at: string;
};

export type SentLog = {
  id: string;
  target_id: string;
  draft_id: string | null;
  subject: string;
  body: string;
  sender: Sender;
  send_mode: 'manual';
  external_message_id: string | null;
  sent_at: string;
  replied_at: string | null;
  status: 'sent' | 'replied' | 'bounced';
  targets?: Pick<Target, 'name' | 'email' | 'category'> | null;
};

export type Activity = {
  id: string;
  text: string;
  type: string;
  actor_email: string | null;
  created_at: string;
};

export type LintIssue = {
  id: string;
  message: string;
  match?: string;
};

export type LintResult = {
  passed: boolean;
  errors: LintIssue[];
};
