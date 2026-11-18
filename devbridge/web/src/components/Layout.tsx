import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, Sparkles, FolderKanban, SquareTerminal, MonitorPlay, Settings, CheckCircle2, AlertTriangle, XCircle, Info, X, PlugZap, Bot } from 'lucide-react';
import { useAgent, type ConnState } from '../lib/agent';
import { Badge, Button, StatusDot, cx } from './ui';
import { ErrorBoundary } from './ErrorBoundary';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/builder', label: 'AI Project Builder', icon: Sparkles },
  { to: '/projects', label: 'My Projects', icon: FolderKanban },
  { to: '/terminal', label: 'Live Terminal', icon: SquareTerminal },
  { to: '/preview', label: 'Live Preview', icon: MonitorPlay },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const connMeta: Record<ConnState, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  idle: { label: 'Not configured', tone: 'neutral' },
  connecting: { label: 'Connecting…', tone: 'warn' },
  connected: { label: 'Connected', tone: 'ok' },
  unauthorized: { label: 'Token rejected', tone: 'bad' },
  unreachable: { label: 'Not reachable', tone: 'bad' },
  misconfigured: { label: 'Blocked', tone: 'bad' },
};

export function useClaudeState() {
  const { conn, status } = useAgent();
  if (conn !== 'connected' || !status) return { label: 'Unknown', tone: 'neutral' as const, detail: 'Needs the local agent' };
  return status.claude.installed
    ? { label: 'Ready', tone: 'ok' as const, detail: status.claude.version ?? '' }
    : { label: 'Not found', tone: 'bad' as const, detail: status.claude.hint ?? status.claude.error ?? '' };
}

export function ConnectionIndicators({ compact }: { compact?: boolean }) {
  const { conn, isDemo } = useAgent();
  const claude = useClaudeState();
  const m = connMeta[conn];
  const rows = [
    { icon: <PlugZap className="h-3.5 w-3.5" />, name: 'Local agent', label: m.label, tone: m.tone, pulse: conn === 'connected' || conn === 'connecting' },
    { icon: <Bot className="h-3.5 w-3.5" />, name: 'Claude Code', label: claude.label, tone: claude.tone, pulse: claude.tone === 'ok' },
  ];
  return (
    <div className={cx('space-y-1.5', compact && 'flex gap-4 space-y-0')}>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-3 text-xs" title={r.name === 'Claude Code' ? claude.detail : undefined}>
          <span className="flex items-center gap-2 text-muted">
            {r.icon}
            {r.name}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <StatusDot tone={r.tone} pulse={r.pulse} />
            <span className={r.tone === 'ok' ? 'text-ok' : r.tone === 'bad' ? 'text-bad' : r.tone === 'warn' ? 'text-warn' : 'text-muted'}>{r.label}</span>
          </span>
        </div>
      ))}
      {isDemo && !compact && <p className="pt-1 text-[11px] text-warn">Showing demo data</p>}
    </div>
  );
}

export function Layout() {
  const { approvals, servers, jobs, conn, connError, isDemo, reconnect } = useAgent();
  const loc = useLocation();
  const running = Object.values(servers).filter((s) => s.status === 'running' || s.status === 'starting').length;
  const activeJobs = Object.values(jobs).filter((j) => j.status === 'running').length;
  const counts: Record<string, number> = { '/terminal': approvals.length, '/preview': running, '/builder': activeJobs };
  const current = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)));

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line/70 bg-panel/60 md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-line/70 px-5">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">DevBridge</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-faint">AI Workspace</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-gradient-to-r from-accent/15 to-violet/5 text-fg shadow-[inset_2px_0_0_0_rgb(var(--accent))]' : 'text-muted hover:bg-raised/70 hover:text-fg',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {counts[to] > 0 && (
                <span className={cx('rounded-full px-1.5 text-[10px] font-semibold', to === '/terminal' ? 'bg-warn/20 text-warn' : 'bg-accent/20 text-accent')}>{counts[to]}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-xl border border-line/70 bg-bg/40 p-3">
          <ConnectionIndicators />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line/70 bg-bg/70 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-faint md:hidden">DevBridge /</span>
            <span className="font-medium">{current?.label}</span>
          </div>
          <div className="flex items-center gap-3">
            {isDemo && <Badge tone="warn">Demo mode, not your data</Badge>}
            <Link to="/settings" className="hidden items-center gap-2 rounded-lg border border-line/70 px-2.5 py-1 text-xs text-muted transition hover:border-accent/50 sm:flex">
              <StatusDot tone={connMeta[conn].tone} pulse={conn === 'connected'} />
              Agent: {connMeta[conn].label}
            </Link>
          </div>
        </header>

        {conn !== 'connected' && conn !== 'idle' && !loc.pathname.startsWith('/settings') && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bad/20 bg-bad/5 px-4 py-2.5 text-sm md:px-8">
            <span className="flex items-center gap-2 text-bad">
              <AlertTriangle className="h-4 w-4" />
              {connError ?? connMeta[conn].label}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={reconnect}>Retry</Button>
              <Link to="/settings"><Button size="sm">Diagnostics</Button></Link>
            </div>
          </div>
        )}

        <nav className="flex gap-1 overflow-x-auto border-b border-line/70 px-2 py-1.5 md:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs', isActive ? 'bg-raised text-fg' : 'text-muted')}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="relative flex-1 overflow-y-auto">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-accent/[0.06] via-violet/[0.03] to-transparent" />
          <div key={loc.pathname} className="relative mx-auto max-w-7xl animate-fade-in px-4 py-6 md:px-8 md:py-8">
            <ErrorBoundary resetKey={loc.pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <Toasts />
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useAgent();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.tone === 'ok' ? CheckCircle2 : t.tone === 'error' ? XCircle : Info;
        return (
          <div key={t.id} className="pointer-events-auto flex animate-fade-in gap-3 rounded-xl border border-line bg-panel p-3 shadow-2xl">
            <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', t.tone === 'ok' ? 'text-ok' : t.tone === 'error' ? 'text-bad' : 'text-accent')} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t.title}</div>
              {t.body && <div className="mt-0.5 break-words text-xs text-muted">{t.body}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-faint hover:text-fg" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
