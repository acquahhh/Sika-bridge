import { Link } from 'react-router-dom';
import { FolderKanban, Bot, FilePlus2, FilePen, MonitorPlay, Sparkles, ArrowRight, Activity as ActivityIcon, PlugZap, Server, Code2, Terminal } from 'lucide-react';
import { useAgent } from '../lib/agent';
import { Badge, Button, Card, CardHeader, DemoBadge, EmptyState, StatusDot, cx } from '../components/ui';
import { connMeta, useClaudeState } from '../components/Layout';
import { timeAgo, projectStatusLabel, projectStatusTone } from '../lib/format';
import { frameworkLabel } from '../lib/types';

export default function Overview() {
  const { stats, projects, activity, conn, isDemo, status, servers, connError } = useAgent();
  const claude = useClaudeState();
  const has = conn === 'connected' || isDemo;
  const v = (n: number | undefined) => (has && n != null ? n.toLocaleString() : '—');

  const tiles = [
    { label: 'Total projects', value: v(stats?.totalProjects), icon: FolderKanban, tone: 'text-accent' },
    { label: 'Active coding sessions', value: v(stats?.activeSessions), icon: Bot, tone: 'text-violet' },
    { label: 'Files created', value: v(stats?.filesCreated), icon: FilePlus2, tone: 'text-ok' },
    { label: 'Files modified', value: v(stats?.filesModified), icon: FilePen, tone: 'text-accent' },
    { label: 'Running applications', value: v(stats?.runningApps), icon: MonitorPlay, tone: 'text-warn' },
  ];
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;
  const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const runningServers = Object.values(servers).filter((s) => s.status === 'running' || s.status === 'starting');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Build on your machine, <span className="text-gradient">guided by AI</span>
            </h1>
            {isDemo && <DemoBadge />}
          </div>
          <p className="mt-1.5 text-sm text-muted">Describe an app, let Claude Code write it into your workspace, then run and preview it locally.</p>
        </div>
        <Link to="/builder">
          <Button variant="primary" size="lg" icon={<Sparkles className="h-4 w-4" />}>New AI project</Button>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConnectionCard
          icon={<PlugZap className="h-5 w-5" />}
          title="Local agent"
          state={connMeta[conn].label}
          tone={connMeta[conn].tone}
          detail={conn === 'connected' && status ? `v${status.agent.version} · ${status.agent.hostname} · ${status.agent.platform}` : connError ?? 'Start the agent and paste its token in Settings.'}
          sub={conn === 'connected' && status ? status.agent.workspaceRoot : undefined}
        />
        <ConnectionCard
          icon={<Bot className="h-5 w-5" />}
          title="Claude Code CLI"
          state={claude.label}
          tone={claude.tone}
          detail={claude.detail || 'Detected through the local agent'}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="group p-4 transition hover:border-accent/40">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{label}</span>
              <Icon className={cx('h-4 w-4 opacity-80', tone)} />
            </div>
            <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
          </Card>
        ))}
      </div>
      {!has && <p className="-mt-2 text-xs text-faint">Numbers appear once the local agent is connected. Nothing here is estimated.</p>}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Recent project activity" icon={<ActivityIcon className="h-4 w-4" />} action={isDemo ? <DemoBadge /> : undefined} />
          {activity.length === 0 ? (
            <EmptyState icon={<ActivityIcon className="h-5 w-5" />} title="No activity yet" body={has ? 'Create a project to get started.' : 'Activity from your local agent will appear here.'} />
          ) : (
            <ul className="divide-y divide-line/60">
              {activity.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <ActivityIconFor kind={a.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{a.message}</p>
                    {projectName(a.projectId) && <p className="text-xs text-muted">{projectName(a.projectId)}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-faint">{timeAgo(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Recently updated" icon={<FolderKanban className="h-4 w-4" />} action={<Link to="/projects" className="flex items-center gap-1 text-xs text-accent hover:underline">All projects <ArrowRight className="h-3 w-3" /></Link>} />
            {recent.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No projects yet.</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted">{frameworkLabel(p.framework)} · {timeAgo(p.updatedAt)}</p>
                    </div>
                    <Badge tone={projectStatusTone[p.status]} dot>{projectStatusLabel[p.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Running applications" icon={<Server className="h-4 w-4" />} />
            {runningServers.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No dev servers running.</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {runningServers.map((s) => (
                  <li key={s.projectId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="flex items-center gap-2">
                      <StatusDot tone={s.status === 'running' ? 'ok' : 'warn'} pulse />
                      {s.projectName}
                    </span>
                    <Link to="/preview" className="font-mono text-xs text-accent hover:underline">{s.url ?? 'starting…'}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ConnectionCard({ icon, title, state, tone, detail, sub }: { icon: React.ReactNode; title: string; state: string; tone: 'ok' | 'warn' | 'bad' | 'neutral'; detail: string; sub?: string }) {
  const ring = { ok: 'from-ok/20', warn: 'from-warn/20', bad: 'from-bad/20', neutral: 'from-line/40' }[tone];
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={cx('pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br to-transparent blur-2xl', ring)} />
      <div className="relative flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-raised text-muted">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            <span className="flex items-center gap-2 text-xs font-medium">
              <StatusDot tone={tone} pulse={tone === 'ok'} />
              <span className={tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-muted'}>{state}</span>
            </span>
          </div>
          <p className="mt-1 break-words text-xs text-muted">{detail}</p>
          {sub && <p className="mt-1 truncate font-mono text-[11px] text-faint" title={sub}>{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

function ActivityIconFor({ kind }: { kind: string }) {
  const map: Record<string, [React.ElementType, string]> = {
    claude: [Bot, 'text-violet bg-violet/10'],
    server: [Server, 'text-ok bg-ok/10'],
    vscode: [Code2, 'text-accent bg-accent/10'],
    project: [FolderKanban, 'text-accent bg-accent/10'],
  };
  const [Icon, cls] = map[kind] ?? [Terminal, 'text-muted bg-raised'];
  return (
    <span className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', cls)}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}
