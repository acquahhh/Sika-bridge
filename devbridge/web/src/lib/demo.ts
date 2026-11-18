// Demonstration data. Shown ONLY when the user turns on "Demo data" in
// Settings and no agent is connected. Every screen that renders it shows a
// "Demo data" badge, and actions are disabled.
import type { Activity, CommandEntry, DevServer, Job, OutputLine, Project, Stats } from './types';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export const demoProjects: Project[] = [
  { id: 'demo-1', name: 'Student Finance Tracker', description: 'Budgets, transactions and dashboards with authentication', framework: 'vite-react', language: 'TypeScript', dir: 'C:\\Users\\you\\DevBridgeProjects\\student-finance-tracker', status: 'running', claudeSessionId: 'demo', createdAt: ago(60 * 26), updatedAt: ago(4), exists: true },
  { id: 'demo-2', name: 'Campus Events API', description: 'REST API for clubs and events', framework: 'node', language: 'JavaScript', dir: 'C:\\Users\\you\\DevBridgeProjects\\campus-events-api', status: 'ready', claudeSessionId: 'demo', createdAt: ago(60 * 72), updatedAt: ago(60 * 5), exists: true },
  { id: 'demo-3', name: 'Portfolio Site', description: 'Personal portfolio', framework: 'html', language: 'HTML/CSS/JS', dir: 'C:\\Users\\you\\DevBridgeProjects\\portfolio-site', status: 'idle', claudeSessionId: null, createdAt: ago(60 * 24 * 6), updatedAt: ago(60 * 24 * 2), exists: true },
  { id: 'demo-4', name: 'Study Planner', description: 'Next.js planner with calendar', framework: 'nextjs', language: 'TypeScript', dir: 'C:\\Users\\you\\DevBridgeProjects\\study-planner', status: 'generating', claudeSessionId: null, createdAt: ago(2), updatedAt: ago(1), exists: true },
  { id: 'demo-5', name: 'Grade Analyzer', description: 'Python CLI and charts', framework: 'python', language: 'Python', dir: 'C:\\Users\\you\\DevBridgeProjects\\grade-analyzer', status: 'error', claudeSessionId: 'demo', createdAt: ago(60 * 24 * 9), updatedAt: ago(60 * 24 * 3), exists: true },
];

export const demoStats: Stats = { totalProjects: 5, activeSessions: 1, filesCreated: 184, filesModified: 72, runningApps: 1 };

export const demoActivity: Activity[] = [
  { id: 'a1', kind: 'claude', message: 'Generating project started', projectId: 'demo-4', at: ago(2) },
  { id: 'a2', kind: 'server', message: 'Started dev server: npm run dev', projectId: 'demo-1', at: ago(4) },
  { id: 'a3', kind: 'claude', message: 'Claude Code completed (6 file changes)', projectId: 'demo-1', at: ago(18) },
  { id: 'a4', kind: 'vscode', message: 'Opened in VS Code', projectId: 'demo-2', at: ago(60 * 5) },
  { id: 'a5', kind: 'project', message: 'Created project "Study Planner"', projectId: 'demo-4', at: ago(60 * 6) },
];

export const demoServers: DevServer[] = [
  { projectId: 'demo-1', projectName: 'Student Finance Tracker', command: 'npm run dev', status: 'running', port: 5174, url: 'http://localhost:5174', processId: 'p1', startedAt: ago(4) },
];

export const demoHistory: CommandEntry[] = [
  { id: 'c1', projectId: 'demo-1', projectName: 'Student Finance Tracker', command: 'npm run dev', reason: 'Dev server', status: 'running', at: ago(4), kind: 'server' },
  { id: 'c2', projectId: 'demo-1', projectName: 'Student Finance Tracker', command: 'npm install', reason: 'Package script or install from the lockfile', status: 'exited', exitCode: 0, at: ago(6) },
  { id: 'c3', projectId: 'demo-2', projectName: 'Campus Events API', command: 'git push', reason: '"git push" can rewrite history, discard work or reach a remote', status: 'pending_approval', at: ago(1) },
  { id: 'c4', projectId: 'demo-5', projectName: 'Grade Analyzer', command: 'rm -rf build', reason: '"rm" is not on the agent\'s allow-list', status: 'rejected', at: ago(60) },
];

export const demoOutput: OutputLine[] = [
  '> student-finance-tracker@0.1.0 dev',
  '> vite',
  '',
  '  VITE v5.4.11  ready in 412 ms',
  '',
  '  ➜  Local:   http://localhost:5174/',
  '  ➜  Network: use --host to expose',
].map((text, i): OutputLine => ({ processId: 'c1', projectId: 'demo-1', channel: 'stdout', level: 'info', text, at: Date.now() - 4 * 60_000 + i * 50 }))
  .concat([{ processId: 'c1', projectId: 'demo-1', channel: 'stderr', level: 'warn', text: 'warning: Browserslist: caniuse-lite is outdated.', at: Date.now() - 3 * 60_000 }]);

export const demoJob: Job = {
  id: 'demo-job', projectId: 'demo-4', projectName: 'Study Planner', kind: 'generate', prompt: 'Build a study planner with a weekly calendar…', status: 'running', sessionId: null,
  files: [
    { path: 'package.json', action: 'created' },
    { path: 'app/layout.tsx', action: 'created' },
    { path: 'app/page.tsx', action: 'created' },
    { path: 'components/WeekCalendar.tsx', action: 'created' },
  ],
  summary: null, costUsd: null, startedAt: ago(2), endedAt: null,
};
