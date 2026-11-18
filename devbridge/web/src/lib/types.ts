// Shapes returned by the local agent's HTTP API and WebSocket stream.
// Kept in one place so the agent contract is easy to review.

export type FrameworkId = 'react' | 'vite-react' | 'nextjs' | 'vite' | 'node' | 'python' | 'html';
export type Language = 'TypeScript' | 'JavaScript' | 'Python' | 'HTML/CSS/JS';
export type ProjectStatus = 'created' | 'generating' | 'ready' | 'running' | 'idle' | 'error';

export interface Project {
  id: string;
  name: string;
  description: string;
  framework: FrameworkId;
  language: Language;
  dir: string;
  status: ProjectStatus;
  claudeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  exists?: boolean;
}

export interface Stats {
  totalProjects: number;
  activeSessions: number;
  filesCreated: number;
  filesModified: number;
  runningApps: number;
}

export interface ClaudeStatus {
  installed: boolean;
  version: string | null;
  error: string | null;
  hint?: string;
  checkedAt: number;
}

export interface AgentStatus {
  agent: { version: string; platform: string; node: string; hostname: string; uptimeSec: number; workspaceRoot: string };
  claude: ClaudeStatus;
  stats: Stats;
}

export interface JobFile {
  path: string;
  action: 'created' | 'modified';
}

export type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  projectId: string;
  projectName: string;
  kind: 'generate' | 'continue';
  prompt: string;
  status: JobStatus;
  sessionId: string | null;
  files: JobFile[];
  summary: string | null;
  costUsd: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface JobLogLine {
  jobId: string;
  at: number;
  type: 'system' | 'assistant' | 'tool' | 'tool_error' | 'file' | 'result' | 'stderr' | 'error' | 'text';
  text?: string;
  action?: 'created' | 'modified';
  path?: string;
}

export type CommandStatus = 'running' | 'exited' | 'failed' | 'stopped' | 'rejected' | 'pending_approval' | 'denied' | 'expired';

export interface CommandEntry {
  id: string;
  projectId: string;
  projectName: string;
  command: string;
  reason: string;
  status: CommandStatus;
  at: string;
  source?: string;
  kind?: 'command' | 'server';
  pid?: number | null;
  exitCode?: number | null;
  startedAt?: string;
  endedAt?: string | null;
  expiresAt?: string;
  approved?: boolean;
  error?: string;
}

export interface OutputLine {
  processId: string;
  projectId: string;
  channel: 'stdout' | 'stderr';
  level: 'info' | 'warn' | 'error';
  text: string;
  at: number;
}

export type ServerStatus = 'starting' | 'running' | 'stopped' | 'crashed';

export interface DevServer {
  projectId: string;
  projectName: string;
  command: string;
  status: ServerStatus;
  port: number | null;
  url: string | null;
  processId: string | null;
  startedAt: string;
}

export interface Activity {
  id: string;
  kind: 'project' | 'claude' | 'server' | 'vscode' | string;
  message: string;
  projectId: string | null;
  at: string;
}

export interface AgentSettings {
  defaultFramework: FrameworkId;
  terminalPolicy: 'ask' | 'strict';
  claudeAllowInstalls: boolean;
  claudeModel: string;
  workspaceRoot: string;
  allowedOrigins: string[];
  port: number;
  configFile: string;
}

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
  hint?: string;
}

export interface TreeEntry {
  name: string;
  type: 'dir' | 'file';
  skipped?: boolean;
  children?: TreeEntry[];
}

export interface AgentEvent {
  type: string;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  at?: string;
}

export const FRAMEWORKS: { id: FrameworkId; label: string; languages: Language[]; hint: string }[] = [
  { id: 'vite-react', label: 'Vite + React', languages: ['TypeScript', 'JavaScript'], hint: 'Fast SPA with HMR' },
  { id: 'react', label: 'React', languages: ['TypeScript', 'JavaScript'], hint: 'Component-based UI' },
  { id: 'nextjs', label: 'Next.js', languages: ['TypeScript', 'JavaScript'], hint: 'Full-stack React' },
  { id: 'vite', label: 'Vite', languages: ['TypeScript', 'JavaScript'], hint: 'Vanilla Vite app' },
  { id: 'node', label: 'Node.js', languages: ['TypeScript', 'JavaScript'], hint: 'APIs and servers' },
  { id: 'python', label: 'Python', languages: ['Python'], hint: 'Flask, FastAPI, scripts' },
  { id: 'html', label: 'HTML / CSS / JS', languages: ['HTML/CSS/JS'], hint: 'Static site' },
];

export const frameworkLabel = (id: string) => FRAMEWORKS.find((f) => f.id === id)?.label ?? id;
