// Pieces used by several pages: the "connect your agent" gate, the Claude
// Code progress stream, terminal output and a project picker.
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PlugZap, FilePlus2, FilePen, Bot, Wrench, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useAgent } from '../lib/agent';
import type { Job, JobLogLine, OutputLine, Project } from '../lib/types';
import { Badge, Button, Card, EmptyState, Select, cx } from './ui';
import { clock } from '../lib/format';

/** Shown in place of a page's content when there is no agent and no demo. */
export function NeedsAgent({ children, what }: { children: ReactNode; what: string }) {
  const { conn, isDemo, setPrefs } = useAgent();
  if (conn === 'connected' || isDemo) return <>{children}</>;
  return (
    <Card>
      <EmptyState
        icon={<PlugZap className="h-5 w-5" />}
        title="Connect your local agent"
        body={<>To {what}, DevBridge needs the agent running on your computer. Start it with <code className="font-mono text-fg">npm start</code> in <code className="font-mono text-fg">devbridge/agent</code>, then paste its access token in Settings.</>}
        action={
          <div className="flex gap-2">
            <Link to="/settings"><Button variant="primary">Open Settings</Button></Link>
            <Button variant="ghost" onClick={() => setPrefs({ demo: true })}>Explore with demo data</Button>
          </div>
        }
      />
    </Card>
  );
}

export function ProjectSelect({ projects, value, onChange, className }: { projects: Project[]; value: string; onChange: (id: string) => void; className?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Project">
      {projects.length === 0 && <option value="">No projects yet</option>}
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </Select>
  );
}

const lineIcon: Record<JobLogLine['type'], ReactNode> = {
  system: <Info className="h-3.5 w-3.5 text-faint" />,
  assistant: <Bot className="h-3.5 w-3.5 text-violet" />,
  tool: <Wrench className="h-3.5 w-3.5 text-faint" />,
  tool_error: <AlertCircle className="h-3.5 w-3.5 text-warn" />,
  file: null,
  result: <CheckCircle2 className="h-3.5 w-3.5 text-ok" />,
  stderr: <AlertCircle className="h-3.5 w-3.5 text-bad" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-bad" />,
  text: <Info className="h-3.5 w-3.5 text-faint" />,
};

/** Live view of a Claude Code run: messages, tool calls and files. */
export function JobStream({ job, log, stacked }: { job: Job; log: JobLogLine[]; stacked?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length]);
  return (
    <div className={cx('grid gap-4', !stacked && 'lg:grid-cols-[1fr_280px]')}>
      <div className="h-80 overflow-y-auto rounded-lg border border-line bg-bg/70 p-3 font-mono text-xs leading-relaxed">
        {log.length === 0 && <div className="text-faint">{job.status === 'running' ? 'Waiting for Claude Code…' : 'No output recorded.'}</div>}
        {log.map((l, i) => (
          <div key={i} className="flex gap-2 py-0.5">
            <span className="shrink-0 text-faint">{clock(l.at)}</span>
            <span className="mt-0.5 shrink-0">
              {l.type === 'file' ? (l.action === 'created' ? <FilePlus2 className="h-3.5 w-3.5 text-ok" /> : <FilePen className="h-3.5 w-3.5 text-accent" />) : lineIcon[l.type]}
            </span>
            <span className={cx('whitespace-pre-wrap break-words', l.type === 'assistant' ? 'font-sans text-fg' : l.type === 'error' || l.type === 'stderr' ? 'text-bad' : l.type === 'tool_error' ? 'text-warn' : 'text-muted')}>
              {l.type === 'file' ? <><span className={l.action === 'created' ? 'text-ok' : 'text-accent'}>{l.action}</span> {l.path}</> : l.text}
            </span>
          </div>
        ))}
        {job.status === 'running' && <div className="mt-1 h-3 w-2 animate-pulse bg-accent/70" />}
        <div ref={end} />
      </div>
      <div className="rounded-lg border border-line bg-bg/40 p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-muted">Files</span>
          <span className="text-faint">{job.files.length}</span>
        </div>
        <ul className={cx('space-y-1 overflow-y-auto', stacked ? 'max-h-40' : 'max-h-64')}>
          {job.files.length === 0 && <li className="text-xs text-faint">None yet</li>}
          {job.files.map((f) => (
            <li key={f.path} className="flex items-center gap-2 font-mono text-xs">
              {f.action === 'created' ? <FilePlus2 className="h-3.5 w-3.5 shrink-0 text-ok" /> : <FilePen className="h-3.5 w-3.5 shrink-0 text-accent" />}
              <span className="truncate" title={f.path}>{f.path}</span>
            </li>
          ))}
        </ul>
        {job.costUsd != null && <div className="mt-3 border-t border-line pt-2 text-[11px] text-faint">Reported cost ${job.costUsd.toFixed(4)}</div>}
      </div>
    </div>
  );
}

export function TerminalOutput({ lines, emptyText, className }: { lines: OutputLine[]; emptyText?: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);
  return (
    <div
      ref={box}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className={cx('overflow-y-auto bg-[#060912] p-4 font-mono text-[12.5px] leading-relaxed', className)}
    >
      {lines.length === 0 && <div className="text-faint">{emptyText ?? 'No output yet.'}</div>}
      {lines.map((l, i) => (
        <div key={i} className={cx('whitespace-pre-wrap break-all', l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-300' : 'text-slate-300')}>
          {l.text || ' '}
        </div>
      ))}
    </div>
  );
}

export function JobBadge({ status }: { status: Job['status'] }) {
  const tone = status === 'running' ? 'violet' : status === 'completed' ? 'ok' : status === 'failed' ? 'bad' : 'neutral';
  return <Badge tone={tone} dot>{status === 'running' ? 'Working' : status[0].toUpperCase() + status.slice(1)}</Badge>;
}
