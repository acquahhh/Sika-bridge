import type { CommandStatus, JobStatus, ProjectStatus, ServerStatus } from './types';

export function timeAgo(iso: string | number | null | undefined) {
  if (!iso) return '—';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function clock(t: number | string) {
  return new Date(t).toLocaleTimeString(undefined, { hour12: false });
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'violet';

export const projectStatusTone: Record<ProjectStatus, Tone> = {
  created: 'neutral', generating: 'violet', ready: 'accent', running: 'ok', idle: 'neutral', error: 'bad',
};
export const projectStatusLabel: Record<ProjectStatus, string> = {
  created: 'Created', generating: 'Generating', ready: 'Ready', running: 'Running', idle: 'Idle', error: 'Error',
};

export const commandTone: Record<CommandStatus, Tone> = {
  running: 'accent', exited: 'ok', failed: 'bad', stopped: 'neutral', rejected: 'bad', pending_approval: 'warn', denied: 'neutral', expired: 'neutral',
};
export const commandLabel: Record<CommandStatus, string> = {
  running: 'Running', exited: 'Done', failed: 'Failed', stopped: 'Stopped', rejected: 'Blocked', pending_approval: 'Needs approval', denied: 'Denied', expired: 'Expired',
};

export const jobTone: Record<JobStatus, Tone> = { running: 'violet', completed: 'ok', failed: 'bad', cancelled: 'neutral' };
export const serverTone: Record<ServerStatus, Tone> = { starting: 'warn', running: 'ok', stopped: 'neutral', crashed: 'bad' };
