import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Play, Square, RotateCw, ExternalLink, Globe, MonitorPlay, Loader2, RefreshCcw, PanelBottom } from 'lucide-react';
import { useAgent } from '../lib/agent';
import { Badge, Button, Card, CardHeader, DemoBadge, EmptyState, PageHeader, StatusDot, cx } from '../components/ui';
import { NeedsAgent, TerminalOutput } from '../components/shared';
import { serverTone, timeAgo } from '../lib/format';
import { frameworkLabel } from '../lib/types';

export default function Preview() {
  const { projects, servers, output, isDemo, act, loadOutput } = useAgent();
  const [params, setParams] = useSearchParams();
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [showLogs, setShowLogs] = useState(true);

  useEffect(() => {
    if (projectId || !projects.length) return;
    const running = projects.find((p) => servers[p.id]?.status === 'running');
    setProjectId((running ?? projects[0]).id);
  }, [projects, servers, projectId]);

  const project = projects.find((p) => p.id === projectId);
  const server = project ? servers[project.id] : undefined;
  const live = server && (server.status === 'running' || server.status === 'starting');

  useEffect(() => {
    if (server?.processId && !output[server.processId] && !isDemo) loadOutput(server.processId);
  }, [server?.processId, output, isDemo, loadOutput]);

  const call = async (kind: 'start' | 'stop' | 'restart') => {
    if (!project) return;
    setBusy(kind);
    await act((c) => (kind === 'start' ? c.startServer(project.id) : kind === 'stop' ? c.stopServer(project.id) : c.restartServer(project.id)), kind === 'stop' ? 'Server stopped' : undefined);
    setBusy(null);
    setFrameKey((k) => k + 1);
  };

  return (
    <div>
      <PageHeader title="Live Preview" subtitle="Start a project's development server on your computer and preview it here." actions={isDemo && <DemoBadge />} />
      <NeedsAgent what="run development servers">
        <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
          <Card className="h-fit">
            <CardHeader title="Projects" />
            {projects.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No projects yet.</p>
            ) : (
              <ul className="p-2">
                {projects.map((p) => {
                  const s = servers[p.id];
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => { setProjectId(p.id); setParams({ project: p.id }); }}
                        className={cx('flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition', projectId === p.id ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/50 hover:text-fg')}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{p.name}</span>
                          <span className="text-[11px] text-faint">{frameworkLabel(p.framework)}</span>
                        </span>
                        {s && (s.status === 'running' || s.status === 'starting') ? <StatusDot tone={s.status === 'running' ? 'ok' : 'warn'} pulse /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {project ? (
            <div className="min-w-0 space-y-4">
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold">{project.name}</h2>
                      <Badge tone={server ? serverTone[server.status] : 'neutral'} dot>
                        {server ? server.status[0].toUpperCase() + server.status.slice(1) : 'Not started'}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-faint">{server?.command ?? 'Command detected from package.json, app.py or index.html'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!live ? (
                      <Button variant="primary" disabled={isDemo} loading={busy === 'start'} icon={<Play className="h-4 w-4" />} onClick={() => call('start')}>Start server</Button>
                    ) : (
                      <>
                        <Button disabled={isDemo} loading={busy === 'restart'} icon={<RotateCw className="h-4 w-4" />} onClick={() => call('restart')}>Restart</Button>
                        <Button variant="danger" disabled={isDemo} loading={busy === 'stop'} icon={<Square className="h-4 w-4" />} onClick={() => call('stop')}>Stop</Button>
                      </>
                    )}
                    <Button variant="subtle" disabled={!server?.url || server.status !== 'running'} icon={<ExternalLink className="h-4 w-4" />} onClick={() => server?.url && window.open(server.url, '_blank', 'noopener')}>Open preview</Button>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line/60 pt-4 text-sm md:grid-cols-4">
                  <Stat label="Status" value={server ? server.status : 'stopped'} />
                  <Stat label="Localhost address" value={server?.url ? <a href={server.url} target="_blank" rel="noopener noreferrer" className="font-mono text-accent hover:underline">{server.url}</a> : '—'} />
                  <Stat label="Port" value={<span className="font-mono">{server?.port ?? '—'}</span>} />
                  <Stat label="Started" value={server && live ? timeAgo(server.startedAt) : '—'} />
                </dl>
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center gap-2 border-b border-line/70 px-3 py-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-bg/60 px-3 py-1 font-mono text-xs text-muted">
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{server?.url ?? 'about:blank'}</span>
                  </div>
                  <Button size="sm" variant="ghost" aria-label="Reload preview" disabled={server?.status !== 'running'} onClick={() => setFrameKey((k) => k + 1)}><RefreshCcw className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Toggle logs" onClick={() => setShowLogs((s) => !s)} className={showLogs ? 'text-fg' : ''}><PanelBottom className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="relative h-[460px] bg-white">
                  {server?.status === 'running' && server.url && !isDemo ? (
                    <iframe key={frameKey} src={server.url} title={`${project.name} preview`} className="h-full w-full border-0" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-bg">
                      {server?.status === 'starting' ? (
                        <div className="flex flex-col items-center gap-3 text-sm text-muted">
                          <Loader2 className="h-6 w-6 animate-spin text-accent" />
                          Waiting for the server to print its local URL…
                        </div>
                      ) : isDemo && server?.status === 'running' ? (
                        <EmptyState icon={<MonitorPlay className="h-5 w-5" />} title="Demo mode" body="In demo mode there is no real server to embed." />
                      ) : (
                        <EmptyState icon={<MonitorPlay className="h-5 w-5" />} title="Server not running" body={server?.status === 'crashed' ? 'The server exited. Check the logs below.' : 'Start the development server to preview the app here.'} />
                      )}
                    </div>
                  )}
                </div>
                {showLogs && (
                  <div className="border-t border-line/70">
                    <div className="px-4 py-1.5 text-[11px] uppercase tracking-wider text-faint">Server output</div>
                    <TerminalOutput lines={server?.processId ? output[server.processId] ?? [] : []} emptyText="No server output yet." className="h-48" />
                  </div>
                )}
              </Card>
              <p className="text-xs text-faint">If the preview stays blank, the app may block embedding. Use “Open preview” to view it in a new tab.</p>
            </div>
          ) : (
            <Card><EmptyState icon={<MonitorPlay className="h-5 w-5" />} title="Choose a project" /></Card>
          )}
        </div>
      </NeedsAgent>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
