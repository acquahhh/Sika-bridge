import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Wand2, FolderOpen, ShieldCheck, Bot, StopCircle, Play, Code2, ArrowRight } from 'lucide-react';
import { useAgent } from '../lib/agent';
import { FRAMEWORKS, type FrameworkId, type Job, type Language } from '../lib/types';
import { Badge, Button, Card, CardHeader, DemoBadge, Field, Input, Modal, Select, StatusDot, Textarea, cx } from '../components/ui';
import { JobBadge, JobStream } from '../components/shared';
import { useClaudeState } from '../components/Layout';
import { demoJob } from '../lib/demo';

const EXAMPLES = [
  'Build a student finance tracker with authentication, dashboards and transaction management.',
  'Create a habit tracker with streaks, a weekly heatmap and local storage persistence.',
  'Make a REST API for a campus events board with CRUD endpoints and input validation.',
  'Build a markdown notes app with tags, full-text search and a split preview.',
];

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export default function Builder() {
  const { client, conn, isDemo, settings, jobs, jobLogs, act, loadJob, notify } = useAgent();
  const claude = useClaudeState();
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [framework, setFramework] = useState<FrameworkId>('vite-react');
  const [language, setLanguage] = useState<Language>('TypeScript');
  const [parent, setParent] = useState('');
  const [folders, setFolders] = useState<{ root: string; folders: string[] } | null>(null);
  const [review, setReview] = useState<{ prompt: string; dir: string } | null>(null);
  const [allowExisting, setAllowExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    if (settings?.defaultFramework) setFramework(settings.defaultFramework);
  }, [settings?.defaultFramework]);

  useEffect(() => {
    if (client) client.folders().then(setFolders).catch(() => setFolders(null));
  }, [client]);

  const fw = FRAMEWORKS.find((f) => f.id === framework)!;
  useEffect(() => {
    if (!fw.languages.includes(language)) setLanguage(fw.languages[0]);
  }, [fw, language]);

  const generationJobs = useMemo(() => Object.values(jobs).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [jobs]);
  const active: Job | undefined = isDemo ? demoJob : jobId ? jobs[jobId] : generationJobs.find((j) => j.status === 'running');
  useEffect(() => {
    if (active && !isDemo && !jobLogs[active.id]) loadJob(active.id).catch(() => undefined);
  }, [active, isDemo, jobLogs, loadJob]);

  const canSubmit = !!client && claude.tone === 'ok' && prompt.trim().length > 10 && name.trim().length > 0 && slug(name).length > 0;
  const blockedReason = !client
    ? isDemo ? 'Demo mode: connect the local agent to create real projects.' : 'Connect the local agent in Settings first.'
    : claude.tone !== 'ok' ? 'Claude Code CLI was not detected by the agent. See Settings → Diagnostics.'
    : !name.trim() ? 'Give the project a name.'
    : prompt.trim().length <= 10 ? 'Describe what you want to build.' : null;

  const input = { name, description, framework, language, prompt, parent, folder: slug(name) };

  async function openReview() {
    setBusy(true);
    const r = await act((c) => c.previewPrompt(input));
    setBusy(false);
    if (r) setReview(r);
  }

  async function approve() {
    if (!review) return;
    setBusy(true);
    const r = await act((c) => c.createProject({ ...input, approvedPrompt: review.prompt, allowExisting }));
    setBusy(false);
    if (r) {
      setReview(null);
      setJobId(r.job.id);
      notify({ tone: 'ok', title: 'Project created', body: `Claude Code is now writing ${r.project.name}` });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">AI Project Builder</h1>
          <p className="mt-1 text-sm text-muted">Describe an application. You review the exact instructions before anything is sent to Claude Code.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs" title={claude.detail}>
          <Bot className="h-3.5 w-3.5 text-muted" />
          Claude Code
          <StatusDot tone={claude.tone} pulse={claude.tone === 'ok'} />
          <span className={claude.tone === 'ok' ? 'text-ok' : claude.tone === 'bad' ? 'text-bad' : 'text-muted'}>{claude.label}</span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="relative border-b border-line/70 bg-gradient-to-br from-accent/[0.07] via-transparent to-violet/[0.07] p-5">
            <label htmlFor="prompt" className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Wand2 className="h-4 w-4 text-violet" /> What do you want to build?
            </label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={7}
              maxLength={8000}
              placeholder="e.g. Build a student finance tracker with authentication, dashboards and transaction management."
              className="resize-y border-line/80 bg-bg/70 text-[15px]"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => setPrompt(ex)} className="rounded-full border border-line bg-panel/70 px-3 py-1 text-xs text-muted transition hover:border-accent/50 hover:text-fg">
                  {ex.length > 52 ? ex.slice(0, 50) + '…' : ex}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="Project name" hint={name ? <>Folder: <span className="font-mono">{slug(name) || '—'}</span></> : 'Used for the folder name'}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Student Finance Tracker" maxLength={80} />
            </Field>
            <Field label="Workspace folder" hint={folders ? <span className="font-mono">{folders.root}</span> : 'Projects are created inside the agent\'s workspace'}>
              <Select value={parent} onChange={(e) => setParent(e.target.value)} disabled={!folders}>
                <option value="">Workspace root</option>
                {folders?.folders.map((f) => <option key={f} value={f}>{f}/</option>)}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Project description" hint="Optional. Helps Claude understand the goal.">
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A budgeting app for university students" maxLength={1000} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-muted">Framework</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FRAMEWORKS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFramework(f.id)}
                    className={cx(
                      'rounded-lg border px-3 py-2.5 text-left transition',
                      framework === f.id ? 'border-accent/70 bg-accent/10 shadow-glow' : 'border-line bg-bg/40 hover:border-accent/40',
                    )}
                  >
                    <div className="text-xs font-semibold">{f.label}</div>
                    <div className="mt-0.5 text-[10px] text-faint">{f.hint}</div>
                  </button>
                ))}
              </div>
            </div>
            <Field label="Language">
              <Select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                {fw.languages.map((l) => <option key={l}>{l}</option>)}
              </Select>
            </Field>
            <div className="flex items-end">
              <div className="w-full space-y-2">
                <Button variant="primary" size="lg" className="w-full" disabled={!canSubmit} loading={busy && !review} onClick={openReview} icon={<Sparkles className="h-4 w-4" />}>
                  Create project
                </Button>
                {blockedReason && <p className="text-center text-xs text-faint">{blockedReason}</p>}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Generation"
              subtitle={active ? active.projectName : 'Progress and files appear here while Claude Code works'}
              icon={<Bot className="h-4 w-4" />}
              action={isDemo ? <DemoBadge /> : active ? <JobBadge status={active.status} /> : undefined}
            />
            <div className="p-4">
              {active ? (
                <>
                  <JobStream stacked job={active} log={isDemo ? demoLog : jobLogs[active.id] ?? []} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {active.status === 'running' && !isDemo && (
                      <Button size="sm" variant="danger" icon={<StopCircle className="h-3.5 w-3.5" />} onClick={() => act((c) => c.cancelJob(active.id), 'Cancelled')}>Cancel</Button>
                    )}
                    {active.status === 'completed' && (
                      <>
                        <Button size="sm" icon={<Code2 className="h-3.5 w-3.5" />} onClick={() => act((c) => c.openVSCode(active.projectId), 'Opening VS Code')}>Open in VS Code</Button>
                        <Link to="/preview"><Button size="sm" icon={<Play className="h-3.5 w-3.5" />}>Run & preview</Button></Link>
                        <Link to="/projects"><Button size="sm" variant="ghost">My Projects <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
                      </>
                    )}
                  </div>
                  {active.summary && <p className="mt-3 whitespace-pre-wrap rounded-lg border border-line bg-bg/40 p-3 text-xs text-muted">{active.summary}</p>}
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
                  <Sparkles className="h-6 w-6 text-faint" />
                  No generation in progress.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
              <div className="space-y-1.5 text-xs text-muted">
                <p className="text-sm font-medium text-fg">How generation runs</p>
                <p>The agent runs <code className="font-mono text-fg">claude -p</code> inside the new project folder only. Claude may read and write files there{settings?.claudeAllowInstalls ? ' and run npm/pip installs' : ''}; it cannot run other shell commands.</p>
                <p>Your Claude Code login stays on your computer. No API keys pass through this page.</p>
              </div>
            </div>
          </Card>

          {!isDemo && generationJobs.length > 0 && (
            <Card>
              <CardHeader title="Recent sessions" />
              <ul className="divide-y divide-line/60">
                {generationJobs.slice(0, 6).map((j) => (
                  <li key={j.id}>
                    <button onClick={() => setJobId(j.id)} className={cx('flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-sm hover:bg-raised/50', active?.id === j.id && 'bg-raised/60')}>
                      <span className="truncate">{j.projectName} <span className="text-xs text-faint">· {j.kind === 'generate' ? 'new' : 'continue'}</span></span>
                      <JobBadge status={j.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title="Review instructions for Claude Code"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setReview(null)}>Back</Button>
            <Button variant="primary" loading={busy} onClick={approve} icon={<ShieldCheck className="h-4 w-4" />} disabled={conn !== 'connected' || !review?.prompt.trim()}>
              Approve & create
            </Button>
          </>
        }
      >
        {review && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-bg/50 px-3 py-2 text-xs">
              <FolderOpen className="h-4 w-4 text-accent" />
              <span className="text-muted">Target folder</span>
              <span className="truncate font-mono text-fg">{review.dir}</span>
            </div>
            <Field label="Instructions sent to Claude Code (you can edit them)">
              <Textarea rows={14} value={review.prompt} onChange={(e) => setReview({ ...review, prompt: e.target.value })} className="font-mono text-xs" />
            </Field>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={allowExisting} onChange={(e) => setAllowExisting(e.target.checked)} className="accent-[rgb(var(--accent))]" />
              Use the folder even if it already contains files
            </label>
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{FRAMEWORKS.find((f) => f.id === framework)?.label}</Badge>
              <Badge tone="violet">{language}</Badge>
              <Badge>Edits limited to the project folder</Badge>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const demoLog = [
  { jobId: 'demo-job', at: Date.now() - 110_000, type: 'system' as const, text: 'Session started (demo)' },
  { jobId: 'demo-job', at: Date.now() - 100_000, type: 'assistant' as const, text: "I'll set up a Next.js app with a weekly calendar view and a task store." },
  { jobId: 'demo-job', at: Date.now() - 90_000, type: 'file' as const, action: 'created' as const, path: 'package.json' },
  { jobId: 'demo-job', at: Date.now() - 80_000, type: 'file' as const, action: 'created' as const, path: 'app/layout.tsx' },
  { jobId: 'demo-job', at: Date.now() - 70_000, type: 'file' as const, action: 'created' as const, path: 'app/page.tsx' },
  { jobId: 'demo-job', at: Date.now() - 60_000, type: 'file' as const, action: 'created' as const, path: 'components/WeekCalendar.tsx' },
];
