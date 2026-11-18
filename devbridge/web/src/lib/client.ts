// Typed client for the local DevBridge agent. The browser only ever talks to
// an agent on loopback; the agent decides what is allowed.
import type {
  AgentSettings, AgentStatus, Activity, CommandEntry, DevServer, DiagnosticCheck,
  Job, JobLogLine, OutputLine, Project, Stats, TreeEntry,
} from './types';

export class AgentError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function isLoopbackUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

export class AgentClient {
  constructor(public baseUrl: string, private token: string) {
    if (!isLoopbackUrl(baseUrl)) throw new AgentError(0, 'not_loopback', 'The agent URL must be http://127.0.0.1:<port> or http://localhost:<port>');
  }

  private async req<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        headers: {
          ...(auth ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new AgentError(0, 'unreachable', `Could not reach the agent at ${this.baseUrl}. Is it running?`);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = data?.error;
      throw new AgentError(res.status, e?.code ?? 'http_error', e?.message ?? `Agent returned HTTP ${res.status}`);
    }
    return data as T;
  }

  health = () => this.req<{ ok: boolean; name: string; version: string }>('GET', '/api/health', undefined, false);
  status = () => this.req<AgentStatus>('GET', '/api/status');
  stats = () => this.req<Stats>('GET', '/api/stats');
  diagnostics = () => this.req<{ checks: DiagnosticCheck[]; at: string }>('GET', '/api/diagnostics');
  settings = () => this.req<AgentSettings>('GET', '/api/settings');
  patchSettings = (patch: Partial<AgentSettings>) => this.req<AgentSettings>('PATCH', '/api/settings', patch);
  activity = () => this.req<Activity[]>('GET', '/api/activity');

  projects = () => this.req<Project[]>('GET', '/api/projects');
  tree = (id: string) => this.req<{ entries: TreeEntry[]; truncated: boolean }>('GET', `/api/projects/${id}/tree`);
  folders = () => this.req<{ root: string; folders: string[] }>('GET', '/api/workspace/folders');
  previewPrompt = (input: NewProjectInput) => this.req<{ prompt: string; dir: string }>('POST', '/api/projects/preview-prompt', input);
  createProject = (input: NewProjectInput & { approvedPrompt: string; allowExisting?: boolean }) =>
    this.req<{ project: Project; job: Job }>('POST', '/api/projects', input);
  importProject = (name: string, folder: string) => this.req<Project>('POST', '/api/projects/import', { name, folder });
  deleteProject = (id: string, confirmName: string, deleteFiles: boolean) =>
    this.req<{ ok: true }>('DELETE', `/api/projects/${id}`, { confirmName, deleteFiles });
  openVSCode = (id: string) => this.req<{ ok: true }>('POST', `/api/projects/${id}/open-vscode`);
  continueClaude = (id: string, prompt: string) => this.req<Job>('POST', `/api/projects/${id}/claude`, { prompt });

  jobs = () => this.req<Job[]>('GET', '/api/jobs');
  job = (id: string) => this.req<Job & { log: JobLogLine[] }>('GET', `/api/jobs/${id}`);
  cancelJob = (id: string) => this.req<Job>('POST', `/api/jobs/${id}/cancel`);

  commands = () => this.req<CommandEntry[]>('GET', '/api/commands');
  runCommand = (projectId: string, command: string) => this.req<CommandEntry>('POST', '/api/commands', { projectId, command });
  approvals = () => this.req<CommandEntry[]>('GET', '/api/approvals');
  resolveApproval = (id: string, approve: boolean) => this.req<CommandEntry>('POST', `/api/approvals/${id}`, { approve });
  processes = () => this.req<CommandEntry[]>('GET', '/api/processes');
  output = (id: string) => this.req<OutputLine[]>('GET', `/api/processes/${id}/output`);
  stopProcess = (id: string) => this.req<CommandEntry>('POST', `/api/processes/${id}/stop`);

  servers = () => this.req<DevServer[]>('GET', '/api/servers');
  startServer = (id: string) => this.req<DevServer>('POST', `/api/projects/${id}/server/start`);
  stopServer = (id: string) => this.req<DevServer>('POST', `/api/projects/${id}/server/stop`);
  restartServer = (id: string) => this.req<DevServer>('POST', `/api/projects/${id}/server/restart`);

  wsUrl() {
    return this.baseUrl.replace(/^http/, 'ws') + '/ws';
  }
  get authToken() {
    return this.token;
  }
}

export interface NewProjectInput {
  name: string;
  description: string;
  framework: string;
  language: string;
  prompt: string;
  parent: string;
  folder?: string;
}
