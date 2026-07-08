import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  FileUp,
  LogOut,
  Mail,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import type { Activity, Draft, LintResult, Priority, Sender, SentLog, Target, TargetStatus } from './types';
import seedCsv from '../data/seed_leads_physical_ai.csv?raw';

const allowedEmails = new Set(['viresh@cllctd.ai', 'tarun@cllctd.ai']);
const statuses: TargetStatus[] = ['new', 'queued', 'drafted', 'sent', 'replied', 'bounced', 'dead'];
const priorities: Priority[] = ['HIGH', 'MEDIUM', 'LOW'];
const defaultAssets =
  'rights-cleared first-person task video from real worksites, with supporting audio where useful, captured by contributors and reviewed before delivery';

type View = 'dashboard' | 'targets' | 'compose' | 'followups' | 'log';

type NewLead = {
  name: string;
  email: string;
  website_url: string;
  contact_url: string;
  category: string;
  priority: Priority;
  context: string;
  asset_to_pitch: string;
  notes: string;
  sender: Sender;
};

const emptyLead: NewLead = {
  name: '',
  email: '',
  website_url: '',
  contact_url: '',
  category: '',
  priority: 'MEDIUM',
  context: '',
  asset_to_pitch: '',
  notes: '',
  sender: 'viresh',
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const [headers = [], ...body] = rows;
  return body.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), (values[index] || '').trim()])),
  );
}

function toTargetRows(records: Record<string, string>[]) {
  return records
    .filter((row) => row.name && row.category)
    .map((row) => ({
      name: row.name,
      email: row.email || null,
      website_url: row.website_url || null,
      contact_url: row.contact_url || null,
      category: row.category,
      segment: row.category,
      priority: (priorities.includes(row.priority as Priority) ? row.priority : 'MEDIUM') as Priority,
      status: 'new' as TargetStatus,
      context: row.context || null,
      notes: row.notes || null,
      buyer_angle: row.context || null,
      asset_to_pitch: row.asset_to_pitch || defaultAssets,
      sender: (row.sender === 'tarun' ? 'tarun' : 'viresh') as Sender,
      source: row.source || 'physical_ai_seed',
      source_url: row.source_url || row.website_url || null,
      fit_score: row.priority === 'HIGH' ? 5 : row.priority === 'MEDIUM' ? 3 : 2,
    }));
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] || { empty: '' });
  const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function apiPost<T>(path: string, session: Session, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof json.detail === 'string'
        ? json.detail
        : typeof json.message === 'string'
          ? json.message
          : '';
    throw new Error([json.error || 'Request failed', detail].filter(Boolean).join(': '));
  }
  return json as T;
}

function formatDate(value: string | null) {
  if (!value) return 'never';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [targets, setTargets] = useState<Target[]>([]);
  const [sentLog, setSentLog] = useState<SentLog[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [lint, setLint] = useState<LintResult | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TargetStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [senderFilter, setSenderFilter] = useState<'all' | Sender>('all');
  const [lead, setLead] = useState<NewLead>(emptyLead);

  const email = session?.user.email?.toLowerCase() || '';
  const allowed = allowedEmails.has(email);
  const selectedTarget = targets.find((target) => target.id === selectedId) || null;
  const lintPassed = Boolean(lint?.passed);

  useEffect(() => {
    async function initSession() {
      const params = new URLSearchParams(window.location.search);
      const callbackError = params.get('error_description') || params.get('error');
      if (callbackError) {
        setNotice(`OAuth failed: ${callbackError}`);
        window.history.replaceState({}, '', '/outreach');
      }

      const code = params.get('code');
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) setNotice(`OAuth callback failed: ${error.message}`);
        setSession(data.session);
        window.history.replaceState({}, '', '/outreach');
        setAuthReady(true);
        return;
      }

      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setAuthReady(true);
    }

    initSession();
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (window.location.pathname !== '/outreach') {
      window.history.replaceState({}, '', `/outreach${window.location.search}${window.location.hash}`);
    }
  }, []);

  async function loadData() {
    if (!allowed) return;
    setBusy('refresh');
    const [targetResult, logResult, activityResult] = await Promise.all([
      supabase.from('targets').select('*').order('created_at', { ascending: false }),
      supabase.from('sent_log').select('*, targets(name,email,category)').order('sent_at', { ascending: false }),
      supabase.from('activity').select('*').order('created_at', { ascending: false }).limit(20),
    ]);
    setBusy('');
    if (targetResult.error) throw targetResult.error;
    if (logResult.error) throw logResult.error;
    if (activityResult.error) throw activityResult.error;
    setTargets((targetResult.data || []) as Target[]);
    setSentLog((logResult.data || []) as SentLog[]);
    setActivity((activityResult.data || []) as Activity[]);
  }

  useEffect(() => {
    loadData().catch((error) => setNotice(error.message));
  }, [allowed]);

  useEffect(() => {
    async function loadDraft() {
      if (!selectedId) return;
      const { data, error } = await supabase
        .from('drafts')
        .select('*')
        .eq('target_id', selectedId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        setNotice(error.message);
        return;
      }
      const draft = data as Draft | null;
      setSelectedDraft(draft);
      setSubject(draft?.subject || '');
      setBody(draft?.body || '');
      setLint(draft ? { passed: draft.lint_passed, errors: draft.lint_errors || [] } : null);
    }
    loadDraft();
  }, [selectedId]);

  const counts = useMemo(
    () =>
      statuses.reduce<Record<TargetStatus, number>>((acc, status) => {
        acc[status] = targets.filter((target) => target.status === status).length;
        return acc;
      }, {} as Record<TargetStatus, number>),
    [targets],
  );

  const filteredTargets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return targets.filter((target) => {
      const matchesSearch =
        !needle ||
        [target.name, target.email, target.category, target.context, target.asset_to_pitch]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      return (
        matchesSearch &&
        (statusFilter === 'all' || target.status === statusFilter) &&
        (priorityFilter === 'all' || target.priority === priorityFilter) &&
        (senderFilter === 'all' || target.sender === senderFilter)
      );
    });
  }, [targets, query, statusFilter, priorityFilter, senderFilter]);

  const followups = useMemo(() => {
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    return targets.filter(
      (target) => target.status === 'sent' && target.last_contacted_at && new Date(target.last_contacted_at).getTime() <= cutoff,
    );
  }, [targets]);

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/outreach`,
        queryParams: { prompt: 'select_account' },
      },
    });
  }

  async function importSeedCsv() {
    setBusy('import');
    const rows = toTargetRows(parseCsv(seedCsv));
    const { error } = await supabase.from('targets').upsert(rows, { onConflict: 'name,website_url' });
    if (error) {
      setNotice(error.message);
    } else {
      await supabase.from('activity').insert({ text: `Imported ${rows.length} physical AI targets`, type: 'import' });
      setNotice(`Imported ${rows.length} targets`);
      await loadData();
    }
    setBusy('');
  }

  async function importCsvFile(file: File) {
    setBusy('import-file');
    const rows = toTargetRows(parseCsv(await file.text()));
    const { error } = await supabase.from('targets').upsert(rows, { onConflict: 'name,website_url' });
    if (error) setNotice(error.message);
    else {
      await supabase.from('activity').insert({ text: `Imported ${rows.length} targets from CSV`, type: 'import' });
      setNotice(`Imported ${rows.length} targets`);
      await loadData();
    }
    setBusy('');
  }

  async function addLead() {
    if (!lead.name || !lead.category) {
      setNotice('Name and category are required');
      return;
    }
    const { error } = await supabase.from('targets').insert({
      ...lead,
      email: lead.email || null,
      website_url: lead.website_url || null,
      contact_url: lead.contact_url || null,
      context: lead.context || null,
      asset_to_pitch: lead.asset_to_pitch || defaultAssets,
      notes: lead.notes || null,
      source: 'manual',
      segment: lead.category,
      buyer_angle: lead.context || null,
      fit_score: lead.priority === 'HIGH' ? 5 : lead.priority === 'MEDIUM' ? 3 : 2,
    });
    if (error) setNotice(error.message);
    else {
      setLead(emptyLead);
      await supabase.from('activity').insert({ text: `Added target: ${lead.name}`, type: 'target' });
      await loadData();
      setNotice('Lead added');
    }
  }

  async function generateDraft() {
    if (!selectedTarget || !session) return;
    setBusy('generate');
    setNotice('');
    try {
      const result = await apiPost<{ subject: string; body: string; lint: LintResult }>('/api/generate-email', session, {
        buyerName: selectedTarget.name,
        category: selectedTarget.category,
        context: selectedTarget.context || selectedTarget.notes || selectedTarget.category,
        assets: selectedTarget.asset_to_pitch || defaultAssets,
        sampleLink: 'sample reel available on request',
        cta: 'Worth a look?',
        signoff: selectedTarget.sender === 'tarun' ? 'Tarun' : 'V',
      });
      setSubject(result.subject);
      setBody(result.body);
      setLint(result.lint);
      const { data, error } = await supabase
        .from('drafts')
        .insert({
          target_id: selectedTarget.id,
          subject: result.subject,
          body: result.body,
          sender: selectedTarget.sender,
          status: result.lint.passed ? 'draft' : 'blocked',
          lint_passed: result.lint.passed,
          lint_errors: result.lint.errors,
        })
        .select('*')
        .single();
      if (error) throw error;
      setSelectedDraft(data as Draft);
      await supabase.from('targets').update({ status: 'drafted' }).eq('id', selectedTarget.id);
      await supabase.from('activity').insert({ text: `Drafted: ${selectedTarget.name}`, type: 'draft' });
      await loadData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Draft failed');
    } finally {
      setBusy('');
    }
  }

  async function runLint() {
    if (!session || !body.trim()) return;
    setBusy('lint');
    try {
      const result = await apiPost<LintResult>('/api/lint-email', session, { subject, body });
      setLint(result);
      if (selectedDraft) {
        await supabase
          .from('drafts')
          .update({
            subject,
            body,
            status: result.passed ? 'draft' : 'blocked',
            lint_passed: result.passed,
            lint_errors: result.errors,
          })
          .eq('id', selectedDraft.id);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Lint failed');
    } finally {
      setBusy('');
    }
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(`${subject}\n\n${body}`);
    setNotice('Draft copied');
  }

  function openMailClient() {
    if (!selectedTarget?.email) return;
    const href = `mailto:${encodeURIComponent(selectedTarget.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  }

  async function markSent() {
    if (!session || !selectedTarget || !lintPassed) return;
    setBusy('mark-sent');
    try {
      await apiPost('/api/manual-log-send', session, {
        targetId: selectedTarget.id,
        draftId: selectedDraft?.id,
        subject,
        body,
        sender: selectedTarget.sender,
      });
      setNotice('Marked sent');
      await loadData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Send log failed');
    } finally {
      setBusy('');
    }
  }

  if (!authReady) {
    return <main className="boot">loading outreach console</main>;
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="kicker">cllctd / outreach</div>
          <h1>Physical AI buyer console</h1>
          <p>Google auth is required. Access is limited to the cllctd founder accounts.</p>
          {notice && <p className="auth-error">{notice}</p>}
          <button className="primary" onClick={signIn}>
            <ShieldCheck size={16} /> Sign in with Google
          </button>
        </section>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="kicker">access denied</div>
          <h1>{email}</h1>
          <p>This console is allowlisted for Viresh and Tarun only.</p>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} /> Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">cllctd</div>
          <div className="kicker">outreach / stage 1</div>
        </div>
        <nav>
          {(['dashboard', 'targets', 'compose', 'followups', 'log'] as View[]).map((item) => (
            <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>
              {item}
            </button>
          ))}
        </nav>
        <div className="session">
          <span>{email}</span>
          <button className="icon-button" aria-label="Sign out" onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="kicker">CAPTURE / GRADE / LICENSE</div>
            <h1>{view}</h1>
          </div>
          <button className="ghost" onClick={() => loadData()} disabled={busy === 'refresh'}>
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button onClick={() => setNotice('')}>clear</button>
          </div>
        )}

        {view === 'dashboard' && (
          <div className="grid two">
            <section className="panel">
              <h2>Status</h2>
              <div className="counts">
                {statuses.map((status) => (
                  <div className="metric" key={status}>
                    <span>{status}</span>
                    <strong>{counts[status] || 0}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <h2>Recent activity</h2>
              <div className="activity-list">
                {activity.map((item) => (
                  <div key={item.id} className="activity-row">
                    <span>{item.text}</span>
                    <small>{formatDate(item.created_at)}</small>
                  </div>
                ))}
                {!activity.length && <p className="muted">No activity yet.</p>}
              </div>
            </section>
          </div>
        )}

        {view === 'targets' && (
          <div className="stack">
            <section className="toolbar">
              <label className="search">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search targets" />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | TargetStatus)}>
                <option value="all">all status</option>
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as 'all' | Priority)}
              >
                <option value="all">all priority</option>
                {priorities.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
              <select value={senderFilter} onChange={(event) => setSenderFilter(event.target.value as 'all' | Sender)}>
                <option value="all">all senders</option>
                <option value="viresh">viresh</option>
                <option value="tarun">tarun</option>
              </select>
              <button className="ghost" onClick={importSeedCsv} disabled={busy === 'import'}>
                <FileUp size={16} /> Import seed
              </button>
              <label className="file-button">
                <FileUp size={16} /> CSV
                <input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && importCsvFile(event.target.files[0])} />
              </label>
            </section>

            <section className="panel compact">
              <h2>Add lead</h2>
              <div className="lead-form">
                <input placeholder="Name" value={lead.name} onChange={(event) => setLead({ ...lead, name: event.target.value })} />
                <input
                  placeholder="Email"
                  value={lead.email}
                  onChange={(event) => setLead({ ...lead, email: event.target.value })}
                />
                <input
                  placeholder="Website"
                  value={lead.website_url}
                  onChange={(event) => setLead({ ...lead, website_url: event.target.value })}
                />
                <input
                  placeholder="Category"
                  value={lead.category}
                  onChange={(event) => setLead({ ...lead, category: event.target.value })}
                />
                <select value={lead.priority} onChange={(event) => setLead({ ...lead, priority: event.target.value as Priority })}>
                  {priorities.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
                <select value={lead.sender} onChange={(event) => setLead({ ...lead, sender: event.target.value as Sender })}>
                  <option value="viresh">viresh</option>
                  <option value="tarun">tarun</option>
                </select>
                <input
                  className="wide"
                  placeholder="Asset to pitch"
                  value={lead.asset_to_pitch}
                  onChange={(event) => setLead({ ...lead, asset_to_pitch: event.target.value })}
                />
                <input
                  className="wide"
                  placeholder="Targeting context"
                  value={lead.context}
                  onChange={(event) => setLead({ ...lead, context: event.target.value })}
                />
                <button className="primary" onClick={addLead}>
                  <Plus size={16} /> Add
                </button>
              </div>
            </section>

            <TargetTable
              targets={filteredTargets}
              selectedId={selectedId}
              onSelect={(target) => {
                setSelectedId(target.id);
                setView('compose');
              }}
            />
          </div>
        )}

        {view === 'compose' && (
          <div className="grid compose-grid">
            <section className="panel">
              <h2>Selected target</h2>
              {selectedTarget ? (
                <div className="target-detail">
                  <strong>{selectedTarget.name}</strong>
                  <span>{selectedTarget.category}</span>
                  <span>{selectedTarget.email || 'No verified email yet'}</span>
                  <p>{selectedTarget.asset_to_pitch || defaultAssets}</p>
                  <p className="muted">{selectedTarget.context}</p>
                  <button className="primary" onClick={generateDraft} disabled={busy === 'generate'}>
                    <Play size={16} /> Generate draft
                  </button>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Select a target from the table.</p>
                  <button className="ghost" onClick={() => setView('targets')}>
                    Open targets
                  </button>
                </div>
              )}
            </section>

            <section className="panel draft-panel">
              <h2>Draft</h2>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" />
              <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Generated body appears here" />
              <div className="button-row">
                <button className="ghost" onClick={runLint} disabled={!body || busy === 'lint'}>
                  <ShieldCheck size={16} /> Run lint
                </button>
                <button className="ghost" onClick={copyDraft} disabled={!lintPassed}>
                  <Clipboard size={16} /> Copy
                </button>
                <button className="ghost" onClick={openMailClient} disabled={!lintPassed || !selectedTarget?.email}>
                  <Mail size={16} /> Open mail
                </button>
                <button className="primary" onClick={markSent} disabled={!lintPassed || busy === 'mark-sent'}>
                  <Check size={16} /> Mark sent
                </button>
              </div>
            </section>

            <section className={`panel lint-panel ${lint?.passed ? 'pass' : lint ? 'fail' : ''}`}>
              <h2>Lint</h2>
              {!lint && <p className="muted">Run lint before any manual send logging.</p>}
              {lint?.passed && (
                <div className="lint-ok">
                  <Check size={18} /> Passed
                </div>
              )}
              {lint && !lint.passed && (
                <div className="lint-errors">
                  {lint.errors.map((error) => (
                    <div key={`${error.id}-${error.match || error.message}`} className="lint-error">
                      <AlertTriangle size={16} />
                      <span>{error.message}</span>
                      {error.match && <code>{error.match}</code>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {view === 'followups' && (
          <section className="panel">
            <h2>Sent targets needing action</h2>
            <TargetTable
              targets={followups}
              selectedId={selectedId}
              onSelect={(target) => {
                setSelectedId(target.id);
                setView('compose');
              }}
            />
          </section>
        )}

        {view === 'log' && (
          <section className="panel">
            <div className="panel-head">
              <h2>Sent log</h2>
              <button
                className="ghost"
                onClick={() =>
                  downloadCsv(
                    'cllctd-sent-log.csv',
                    sentLog.map((row) => ({
                      target: row.targets?.name || row.target_id,
                      email: row.targets?.email || '',
                      category: row.targets?.category || '',
                      subject: row.subject,
                      sender: row.sender,
                      sent_at: row.sent_at,
                      status: row.status,
                    })),
                  )
                }
                disabled={!sentLog.length}
              >
                <Download size={16} /> Export CSV
              </button>
            </div>
            <div className="log-list">
              {sentLog.map((row) => (
                <div className="log-row" key={row.id}>
                  <div>
                    <strong>{row.targets?.name || row.target_id}</strong>
                    <span>{row.subject}</span>
                  </div>
                  <small>{row.sender}</small>
                  <small>{formatDate(row.sent_at)}</small>
                </div>
              ))}
              {!sentLog.length && <p className="muted">No sends logged yet.</p>}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function TargetTable({
  targets,
  selectedId,
  onSelect,
}: {
  targets: Target[];
  selectedId: string;
  onSelect: (target: Target) => void;
}) {
  return (
    <section className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Target</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Sender</th>
            <th>Route</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((target) => (
            <tr key={target.id} className={selectedId === target.id ? 'selected' : ''} onClick={() => onSelect(target)}>
              <td>
                <strong>{target.name}</strong>
                <span>{target.email || target.website_url || 'research needed'}</span>
              </td>
              <td>{target.category}</td>
              <td>
                <span className={`pill ${target.priority.toLowerCase()}`}>{target.priority}</span>
              </td>
              <td>{target.status}</td>
              <td>{target.sender}</td>
              <td>
                {(target.contact_url || target.website_url) && (
                  <a href={target.contact_url || target.website_url || '#'} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                    <ExternalLink size={15} />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!targets.length && <div className="empty-state">No targets match the current filters.</div>}
    </section>
  );
}

export default App;
