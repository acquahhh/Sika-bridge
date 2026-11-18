// Connection to the local agent plus the live state it streams.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AgentClient, AgentError } from './client';
import type {
  Activity, AgentEvent, AgentSettings, AgentStatus, CommandEntry, DevServer, Job, JobLogLine, OutputLine, Project, Stats,
} from './types';
import * as demo from './demo';

export type ConnState = 'idle' | 'connecting' | 'connected' | 'unauthorized' | 'unreachable' | 'misconfigured';
export type Theme = 'dark' | 'midnight' | 'light';

export interface Prefs {
  agentUrl: string;
  token: string;
  remember: boolean;
  demo: boolean;
  theme: Theme;
}

const DEFAULT_PREFS: Prefs = { agentUrl: 'http://127.0.0.1:4317', token: '', remember: true, demo: false, theme: 'dark' };

function safeGet(store: Storage | undefined, key: string) {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function safeSet(store: Storage | undefined, key: string, value: string | null) {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function loadPrefs(): Prefs {
  const raw = safeGet(globalThis.localStorage, 'devbridge.prefs');
  const p = { ...DEFAULT_PREFS, ...(raw ? JSON.parse(raw) : {}) } as Prefs;
  p.token = safeGet(globalThis.localStorage, 'devbridge.token') ?? safeGet(globalThis.sessionStorage, 'devbridge.token') ?? '';
  return p;
}

function savePrefs(p: Prefs) {
  const { token, ...rest } = p;
  safeSet(globalThis.localStorage, 'devbridge.prefs', JSON.stringify(rest));
  safeSet(globalThis.localStorage, 'devbridge.token', p.remember && token ? token : null);
  safeSet(globalThis.sessionStorage, 'devbridge.token', !p.remember && token ? token : null);
}

export interface Toast {
  id: number;
  tone: 'info' | 'ok' | 'error';
  title: string;
  body?: string;
}

interface Live {
  status: AgentStatus | null;
  settings: AgentSettings | null;
  stats: Stats | null;
  projects: Project[];
  jobs: Record<string, Job>;
  jobLogs: Record<string, JobLogLine[]>;
  history: CommandEntry[];
  processes: Record<string, CommandEntry>;
  output: Record<string, OutputLine[]>;
  approvals: CommandEntry[];
  servers: Record<string, DevServer>;
  activity: Activity[];
}

const EMPTY: Live = { status: null, settings: null, stats: null, projects: [], jobs: {}, jobLogs: {}, history: [], processes: {}, output: {}, approvals: [], servers: {}, activity: [] };

function demoLive(): Live {
  return {
    ...EMPTY,
    stats: demo.demoStats,
    projects: demo.demoProjects,
    jobs: { [demo.demoJob.id]: demo.demoJob },
    history: demo.demoHistory,
    processes: { c1: demo.demoHistory[0] },
    output: { c1: demo.demoOutput },
    approvals: demo.demoHistory.filter((h) => h.status === 'pending_approval'),
    servers: Object.fromEntries(demo.demoServers.map((s) => [s.projectId, s])),
    activity: demo.demoActivity,
  };
}

interface Ctx extends Live {
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  conn: ConnState;
  connError: string | null;
  /** Non-null only when connected. */
  client: AgentClient | null;
  isDemo: boolean;
  reconnect: () => void;
  refresh: () => Promise<void>;
  loadJob: (id: string) => Promise<void>;
  loadOutput: (id: string) => Promise<void>;
  toasts: Toast[];
  notify: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
  /** Run an agent call, showing a toast on failure. Returns undefined on error. */
  act: <T>(fn: (c: AgentClient) => Promise<T>, success?: string) => Promise<T | undefined>;
}

const AgentCtx = createContext<Ctx | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [conn, setConn] = useState<ConnState>('idle');
  const [connError, setConnError] = useState<string | null>(null);
  const [live, setLive] = useState<Live>(EMPTY);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [epoch, setEpoch] = useState(0);
  const clientRef = useRef<AgentClient | null>(null);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  const notify = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.tone === 'error' ? 8000 : 4000);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const refresh = useCallback(async () => {
    const c = clientRef.current;
    if (!c) return;
    const [status, settings, projects, jobs, history, processes, approvals, servers, activity] = await Promise.all([
      c.status(), c.settings(), c.projects(), c.jobs(), c.commands(), c.processes(), c.approvals(), c.servers(), c.activity(),
    ]);
    setLive((l) => ({
      ...l,
      status,
      settings,
      stats: status.stats,
      projects,
      jobs: Object.fromEntries(jobs.map((j) => [j.id, j])),
      history,
      processes: Object.fromEntries(processes.map((p) => [p.id, p])),
      approvals,
      servers: Object.fromEntries(servers.map((s) => [s.projectId, s])),
      activity,
    }));
  }, []);

  const handleEvent = useCallback((ev: AgentEvent) => {
    const d = ev.data;
    setLive((l) => {
      switch (ev.type) {
        case 'project.updated': {
          const exists = l.projects.some((p) => p.id === d.id);
          return { ...l, projects: exists ? l.projects.map((p) => (p.id === d.id ? { ...p, ...d } : p)) : [d, ...l.projects] };
        }
        case 'project.removed':
          return { ...l, projects: l.projects.filter((p) => p.id !== d.id) };
        case 'job.updated':
          return { ...l, jobs: { ...l.jobs, [d.id]: d } };
        case 'job.log': {
          const prev = l.jobLogs[d.jobId] ?? [];
          return { ...l, jobLogs: { ...l.jobLogs, [d.jobId]: [...prev.slice(-1499), d] } };
        }
        case 'process.started':
          return { ...l, processes: { ...l.processes, [d.id]: d }, history: [d, ...l.history.filter((h) => h.id !== d.id)] };
        case 'process.output': {
          const prev = l.output[d.processId] ?? [];
          return { ...l, output: { ...l.output, [d.processId]: [...prev.slice(-1999), d] } };
        }
        case 'process.exit':
          return { ...l, processes: { ...l.processes, [d.id]: d }, history: l.history.map((h) => (h.id === d.id ? { ...h, ...d } : h)) };
        case 'command.rejected':
          return { ...l, history: [d, ...l.history] };
        case 'approval.requested':
          return { ...l, approvals: [d, ...l.approvals], history: [d, ...l.history] };
        case 'approval.resolved':
          return {
            ...l,
            approvals: l.approvals.filter((a) => a.id !== d.id),
            history: d.status === 'approved' ? l.history.filter((h) => h.id !== d.id || h.status !== 'pending_approval') : l.history.map((h) => (h.id === d.id ? { ...h, status: d.status } : h)),
          };
        case 'server.updated':
          return { ...l, servers: { ...l.servers, [d.projectId]: d } };
        case 'activity':
          return { ...l, activity: [d, ...l.activity].slice(0, 50) };
        case 'stats':
          return { ...l, stats: d };
        case 'settings.updated':
          return { ...l, settings: d };
        default:
          return l;
      }
    });
    if (ev.type === 'approval.requested') {
      // Surface approvals wherever the user is.
      setToasts((ts) => [...ts.slice(-3), { id: Date.now(), tone: 'info', title: 'Command needs approval', body: `${d.command} — open Live Terminal to review` }]);
    }
  }, []);

  // Connect / reconnect whenever URL or token changes, or on manual reconnect.
  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    clientRef.current = null;

    if (!prefs.token) {
      setConn('idle');
      setConnError(null);
      setLive(EMPTY);
      return;
    }
    let client: AgentClient;
    try {
      client = new AgentClient(prefs.agentUrl.replace(/\/+$/, ''), prefs.token);
    } catch (e) {
      setConn('misconfigured');
      setConnError((e as Error).message);
      return;
    }

    const schedule = () => {
      if (cancelled) return;
      attempt++;
      retry = setTimeout(connect, Math.min(15000, 1000 * 2 ** Math.min(attempt, 4)));
    };

    async function connect() {
      if (cancelled) return;
      setConn((c) => (c === 'connected' ? 'connecting' : c === 'idle' || c === 'misconfigured' ? 'connecting' : c));
      try {
        await client.health();
        await client.status();
      } catch (e) {
        if (cancelled) return;
        const err = e as AgentError;
        clientRef.current = null;
        if (err.status === 401) {
          setConn('unauthorized');
          setConnError(err.message);
          return; // wrong token: wait for the user
        }
        setConn(err.status === 403 ? 'misconfigured' : 'unreachable');
        setConnError(err.message);
        schedule();
        return;
      }
      if (cancelled) return;
      ws = new WebSocket(client.wsUrl());
      ws.onopen = () => ws?.send(JSON.stringify({ type: 'auth', token: client.authToken }));
      ws.onmessage = async (m) => {
        if (cancelled) return;
        const ev = JSON.parse(m.data) as AgentEvent;
        if (ev.type === 'hello') {
          attempt = 0;
          clientRef.current = client;
          try {
            await refresh();
            if (!cancelled) {
              setConn('connected');
              setConnError(null);
            }
          } catch (e) {
            setConnError((e as Error).message);
          }
          return;
        }
        handleEvent(ev);
      };
      ws.onclose = (e) => {
        if (cancelled) return;
        clientRef.current = null;
        if (e.code === 4401) {
          setConn('unauthorized');
          setConnError('The agent rejected the token on the live connection.');
          return;
        }
        setConn('unreachable');
        setConnError('Lost the live connection to the agent. Retrying…');
        schedule();
      };
    }

    setConn('connecting');
    connect();
    return () => {
      cancelled = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [prefs.agentUrl, prefs.token, epoch, refresh, handleEvent]);

  const reconnect = useCallback(() => setEpoch((e) => e + 1), []);

  const loadJob = useCallback(async (id: string) => {
    const c = clientRef.current;
    if (!c) return;
    const j = await c.job(id);
    const { log, ...job } = j;
    setLive((l) => ({ ...l, jobs: { ...l.jobs, [id]: job }, jobLogs: { ...l.jobLogs, [id]: log } }));
  }, []);

  const loadOutput = useCallback(async (id: string) => {
    const c = clientRef.current;
    if (!c) return;
    try {
      const lines = await c.output(id);
      setLive((l) => ({ ...l, output: { ...l.output, [id]: lines } }));
    } catch {
      /* process expired on the agent */
    }
  }, []);

  const act = useCallback(
    async <T,>(fn: (c: AgentClient) => Promise<T>, success?: string) => {
      const c = clientRef.current;
      if (!c) {
        notify({ tone: 'error', title: 'Agent not connected', body: 'Connect the local agent in Settings first.' });
        return undefined;
      }
      try {
        const r = await fn(c);
        if (success) notify({ tone: 'ok', title: success });
        return r;
      } catch (e) {
        notify({ tone: 'error', title: 'Action failed', body: (e as Error).message });
        return undefined;
      }
    },
    [notify],
  );

  const connected = conn === 'connected';
  const isDemo = !connected && prefs.demo;
  const data = useMemo(() => (connected ? live : isDemo ? demoLive() : EMPTY), [connected, isDemo, live]);

  const value: Ctx = {
    ...data,
    prefs,
    setPrefs,
    conn,
    connError,
    client: connected ? clientRef.current : null,
    isDemo,
    reconnect,
    refresh,
    loadJob,
    loadOutput,
    toasts,
    notify,
    dismiss,
    act,
  };
  return <AgentCtx.Provider value={value}>{children}</AgentCtx.Provider>;
}

export function useAgent() {
  const c = useContext(AgentCtx);
  if (!c) throw new Error('useAgent must be inside AgentProvider');
  return c;
}
