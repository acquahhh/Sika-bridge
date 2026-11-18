import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, ShieldAlert, Check, X, Square, History, ShieldCheck, Loader2, CornerDownLeft } from 'lucide-react';
import { useAgent } from '../lib/agent';
import { Badge, Button, Card, CardHeader, DemoBadge, EmptyState, PageHeader, cx } from '../components/ui';
import { NeedsAgent, ProjectSelect, TerminalOutput } from '../components/shared';
import { commandLabel, commandTone, timeAgo } from '../lib/format';

const QUICK = ['npm install', 'npm run dev', 'npm run build', 'npm test', 'git status', 'py -m pip install -r requirements.txt'];

export default function Terminal() {
  const { projects, history, approvals, processes, output, settings, isDemo, act, loadOutput } = useAgent();
  const [params, setParams] = useSearchParams();
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [cmd, setCmd] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hIdx, setHIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const project = projects.find((p) => p.id === projectId);
  const projectHistory = useMemo(() => history.filter((h) => !projectId || h.projectId === projectId), [history, projectId]);
  const procList = useMemo(() => Object.values(processes).filter((p) => !projectId || p.projectId === projectId).sort((a, b) => (b.startedAt ?? b.at).localeCompare(a.startedAt ?? a.at)), [processes, projectId]);
  const current = selected ? processes[selected] ?? history.find((h) => h.id === selected) : procList[0];
  const typedHistory = useMemo(() => [...new Set(projectHistory.filter((h) => h.source !== 'preview').map((h) => h.command))], [projectHistory]);

  useEffect(() => {
    if (current && !output[current.id] && !isDemo) loadOutput(current.id);
  }, [current, output, isDemo, loadOutput]);

  async function run(line = cmd) {
    if (!line.trim() || !projectId) return;
    setBusy(true);
    const r = await act((c) => c.runCommand(projectId, line.trim()));
    setBusy(false);
    if (!r) return;
    setCmd('');
    setHIdx(-1);
    if (r.status === 'running') setSelected(r.id);
  }

  const running = procList.filter((p) => p.status === 'running');

  return (
    <div>
      <PageHeader
        title="Live Terminal"
        subtitle="Run commands in a project folder through the local agent. Output streams in real time."
        actions={
          <>
            {isDemo && <DemoBadge />}
            <Badge tone={running.length ? 'accent' : 'neutral'} dot>{running.length} running</Badge>
            <Badge tone={settings?.terminalPolicy === 'strict' ? 'ok' : 'warn'}>
              <ShieldCheck className="h-3 w-3" /> Policy: {settings?.terminalPolicy === 'strict' ? 'Strict' : 'Ask for risky commands'}
            </Badge>
          </>
        }
      />
      <NeedsAgent what="run commands">
        {approvals.length > 0 && (
          <Card className="mb-4 border-warn/40 bg-warn/[0.04]">
            <CardHeader title={`${approvals.length} command${approvals.length > 1 ? 's' : ''} waiting for your approval`} subtitle="These can change or delete data, publish code or reach outside the project. Approve only what you recognise." icon={<ShieldAlert className="h-4 w-4 text-warn" />} />
            <ul className="divide-y divide-line/60">
              {approvals.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <code className="font-mono text-sm text-fg">{a.command}</code>
                    <p className="text-xs text-muted">{a.projectName} · {a.reason}{a.expiresAt && ` · expires ${new Date(a.expiresAt).toLocaleTimeString()}`}</p>
                  </div>
                  <Button size="sm" variant="ghost" disabled={isDemo} icon={<X className="h-3.5 w-3.5" />} onClick={() => act((c) => c.resolveApproval(a.id, false), 'Denied')}>Deny</Button>
                  <Button size="sm" variant="primary" disabled={isDemo} icon={<Check className="h-3.5 w-3.5" />} onClick={async () => {
                    const r = await act((c) => c.resolveApproval(a.id, true), 'Approved and started');
                    if (r) setSelected(r.id);
                  }}>Approve & run</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <Card className="flex min-h-[560px] flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line/70 px-3 py-2">
              <div className="flex h-3 gap-1.5 pl-1 pr-2">
                <span className="h-3 w-3 rounded-full bg-bad/70" />
                <span className="h-3 w-3 rounded-full bg-warn/70" />
                <span className="h-3 w-3 rounded-full bg-ok/70" />
              </div>
              <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                {procList.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className={cx('flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs transition', current?.id === p.id ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60')}
                  >
                    {p.status === 'running' ? <Loader2 className="h-3 w-3 animate-spin text-accent" /> : <span className={cx('h-1.5 w-1.5 rounded-full', p.status === 'exited' ? 'bg-ok' : p.status === 'failed' ? 'bg-bad' : 'bg-faint')} />}
                    {p.command.length > 22 ? p.command.slice(0, 21) + '…' : p.command}
                  </button>
                ))}
              </div>
              {current?.status === 'running' && (
                <Button size="sm" variant="danger" disabled={isDemo} icon={<Square className="h-3 w-3" />} onClick={() => act((c) => c.stopProcess(current.id), 'Stopping')}>Stop</Button>
              )}
            </div>

            {current ? (
              <div className="flex items-center justify-between gap-3 border-b border-line/50 bg-bg/40 px-4 py-1.5 text-xs">
                <span className="truncate font-mono text-muted">
                  <span className="text-accent">{current.projectName}</span> $ {current.command}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {current.pid && <span className="text-faint">pid {current.pid}</span>}
                  {current.exitCode != null && <span className="text-faint">exit {current.exitCode}</span>}
                  <Badge tone={commandTone[current.status]}>{commandLabel[current.status]}</Badge>
                </span>
              </div>
            ) : null}

            <TerminalOutput
              lines={current ? output[current.id] ?? [] : []}
              emptyText={current ? (current.status === 'rejected' ? `Blocked: ${current.reason}` : 'No output.') : 'Run a command below. Output, warnings and errors stream here.'}
              className="min-h-[320px] flex-1"
            />

            <div className="border-t border-line/70 bg-panel p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <ProjectSelect projects={projects} value={projectId} onChange={(id) => { setProjectId(id); setParams(id ? { project: id } : {}); setSelected(null); }} className="w-56" />
                {project && <span className="truncate font-mono text-[11px] text-faint" title={project.dir}>{project.dir}</span>}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run();
                }}
                className="flex items-center gap-2 rounded-lg border border-line bg-[#060912] px-3 focus-within:border-accent/60"
              >
                <ChevronRight className="h-4 w-4 text-accent" />
                <input
                  ref={inputRef}
                  value={cmd}
                  onChange={(e) => setCmd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' && typedHistory.length) {
                      e.preventDefault();
                      const i = Math.min(hIdx + 1, typedHistory.length - 1);
                      setHIdx(i);
                      setCmd(typedHistory[i]);
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      const i = hIdx - 1;
                      setHIdx(Math.max(i, -1));
                      setCmd(i >= 0 ? typedHistory[i] : '');
                    }
                  }}
                  disabled={isDemo || !projectId}
                  placeholder={projectId ? 'npm run dev' : 'Create or import a project first'}
                  className="h-10 flex-1 bg-transparent font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Command"
                />
                <Button type="submit" size="sm" variant="ghost" loading={busy} disabled={!cmd.trim() || isDemo} icon={<CornerDownLeft className="h-3.5 w-3.5" />}>Run</Button>
              </form>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK.map((q) => (
                  <button key={q} disabled={isDemo || !projectId} onClick={() => run(q)} className="rounded-md border border-line bg-bg/40 px-2 py-0.5 font-mono text-[11px] text-muted transition hover:border-accent/50 hover:text-fg disabled:opacity-40">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Command history" icon={<History className="h-4 w-4" />} />
              {projectHistory.length === 0 ? (
                <EmptyState icon={<History className="h-5 w-5" />} title="No commands yet" />
              ) : (
                <ul className="max-h-[420px] divide-y divide-line/60 overflow-y-auto">
                  {projectHistory.slice(0, 60).map((h) => (
                    <li key={h.id}>
                      <button onClick={() => setSelected(h.id)} className={cx('w-full px-4 py-2.5 text-left hover:bg-raised/50', current?.id === h.id && 'bg-raised/60')}>
                        <div className="flex items-center justify-between gap-2">
                          <code className="truncate font-mono text-xs">{h.command}</code>
                          <Badge tone={commandTone[h.status]}>{commandLabel[h.status]}</Badge>
                        </div>
                        <div className="mt-0.5 flex justify-between gap-2 text-[11px] text-faint">
                          <span className="truncate">{h.status === 'rejected' || h.status === 'pending_approval' ? h.reason : h.projectName}</span>
                          <span className="shrink-0">{timeAgo(h.at)}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4 text-xs text-muted">
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-fg"><ShieldCheck className="h-4 w-4 text-ok" /> Command safety</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Only npm, npx, pnpm, yarn, node, tsc, python/py, pip, git and code can run.</li>
                <li>No pipes, redirects, chaining or shell expansion.</li>
                <li>Deleting, publishing, global installs, force flags, inline code and paths outside the project need your approval{settings?.terminalPolicy === 'strict' ? ', and are blocked under the strict policy' : ''}.</li>
                <li>Every command runs inside the project folder.</li>
              </ul>
            </Card>
          </div>
        </div>
      </NeedsAgent>
    </div>
  );
}
