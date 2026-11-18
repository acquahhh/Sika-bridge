// Claude Code CLI integration through its supported non-interactive mode:
//   claude -p --output-format stream-json --verbose [--resume <session>]
// The prompt is written to stdin. Claude runs with the project folder as its
// working directory and may only use file tools (plus package installs if the
// user enabled that in Settings). It cannot run arbitrary shell commands.
import fs from 'node:fs';
import path from 'node:path';
import { safeSpawn, killTree, runCapture } from './spawn.js';
import { emit, cryptoId, RingLog } from './store.js';
import { HttpError } from './processes.js';

const FILE_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'LS', 'TodoWrite'];
const INSTALL_TOOLS = ['Bash(npm install:*)', 'Bash(npm i:*)', 'Bash(pip install:*)', 'Bash(py -m pip install:*)', 'Bash(python -m pip install:*)'];

let detection = null;

/** Detect the Claude Code CLI. Cached for 60 seconds. */
export async function detectClaude({ force = false } = {}) {
  if (!force && detection && Date.now() - detection.checkedAt < 60_000) return detection;
  const r = await runCapture('claude', ['--version'], { timeoutMs: 20_000 });
  detection = r.ok
    ? { installed: true, version: r.stdout.split('\n')[0], error: null, checkedAt: Date.now() }
    : {
        installed: false,
        version: null,
        error: r.stderr || `claude exited with code ${r.code}`,
        hint: 'Install Claude Code (npm install -g @anthropic-ai/claude-code), run "claude" once in a terminal to sign in, then restart the agent.',
        checkedAt: Date.now(),
      };
  return detection;
}

export async function detectVSCode() {
  const r = await runCapture('code', ['--version'], { timeoutMs: 15_000 });
  return r.ok ? { installed: true, version: r.stdout.split('\n')[0] } : { installed: false, error: r.stderr || 'Not on PATH' };
}

export class ClaudeJobs {
  constructor(store, cfg) {
    this.store = store;
    this.cfg = cfg;
    /** @type {Map<string, any>} */
    this.jobs = new Map();
  }

  activeCount() {
    return [...this.jobs.values()].filter((j) => j.info.status === 'running').length;
  }

  list() {
    return [...this.jobs.values()].map((j) => j.info);
  }

  get(id) {
    const j = this.jobs.get(id);
    if (!j) throw new HttpError(404, 'job_not_found', 'Job not found');
    return { ...j.info, log: j.log.lines };
  }

  /** Start a Claude Code run in a project folder. */
  async run(project, prompt, { kind = 'generate' } = {}) {
    const claude = await detectClaude();
    if (!claude.installed) {
      throw new HttpError(503, 'claude_unavailable', `Claude Code CLI was not found. ${claude.hint}`);
    }
    if ([...this.jobs.values()].some((j) => j.info.projectId === project.id && j.info.status === 'running')) {
      throw new HttpError(409, 'job_running', 'Claude Code is already working on this project');
    }

    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits'];
    const tools = [...FILE_TOOLS, ...(this.cfg.settings.claudeAllowInstalls ? INSTALL_TOOLS : [])];
    args.push('--allowedTools', tools.join(','));
    if (this.cfg.settings.claudeModel) args.push('--model', this.cfg.settings.claudeModel);
    if (kind === 'continue' && project.claudeSessionId) args.push('--resume', project.claudeSessionId);

    const info = {
      id: cryptoId(),
      projectId: project.id,
      projectName: project.name,
      kind,
      prompt,
      status: 'running',
      sessionId: null,
      files: [],
      summary: null,
      costUsd: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };
    const log = new RingLog(1500);
    // Snapshot existing files so we can tell "created" from "modified" even if
    // Claude has already written a file by the time we read its event.
    const existing = listFiles(project.dir);
    const child = safeSpawn('claude', args, { cwd: project.dir, stdin: 'pipe' });
    this.jobs.set(info.id, { info, log, child });
    this.store.bump('sessionsStarted');
    this.store.updateProject(project.id, { status: 'generating' });
    this.store.log('claude', `${kind === 'generate' ? 'Generating project' : 'Claude Code session'} started`, project.id);
    emit('job.updated', info);

    child.stdin.end(prompt);

    const push = (entry) => {
      const line = { jobId: info.id, at: Date.now(), ...entry };
      log.push(line);
      emit('job.log', line);
    };

    let buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) this.handleLine(l, info, project, push, existing);
    });
    child.stdout.on('end', () => buf && this.handleLine(buf, info, project, push, existing));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => push({ type: 'stderr', text: d.trim() }));
    child.on('error', (e) => push({ type: 'error', text: `Could not start Claude Code: ${e.message}` }));
    child.on('close', (code) => {
      if (info.status === 'running') info.status = info.cancelled ? 'cancelled' : code === 0 ? 'completed' : 'failed';
      info.endedAt = new Date().toISOString();
      const patch = { status: info.status === 'completed' ? 'ready' : info.status === 'cancelled' ? 'idle' : 'error' };
      if (info.sessionId) patch.claudeSessionId = info.sessionId;
      this.store.updateProject(project.id, patch);
      this.store.log('claude', `Claude Code ${info.status} (${info.files.length} file change${info.files.length === 1 ? '' : 's'})`, project.id);
      emit('job.updated', info);
    });
    return info;
  }

  handleLine(raw, info, project, push, existing) {
    const text = raw.trim();
    if (!text) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      push({ type: 'text', text });
      return;
    }
    if (msg.type === 'system' && msg.subtype === 'init') {
      info.sessionId = msg.session_id;
      push({ type: 'system', text: `Session started (model ${msg.model || 'default'})` });
      emit('job.updated', info);
    } else if (msg.type === 'assistant') {
      for (const block of msg.message?.content || []) {
        if (block.type === 'text' && block.text?.trim()) push({ type: 'assistant', text: block.text.trim() });
        if (block.type === 'tool_use') this.handleTool(block, info, project, push, existing);
      }
    } else if (msg.type === 'user') {
      for (const block of msg.message?.content || []) {
        if (block.type === 'tool_result' && block.is_error) {
          const c = Array.isArray(block.content) ? block.content.map((x) => x.text || '').join(' ') : String(block.content || '');
          push({ type: 'tool_error', text: c.slice(0, 500) });
        }
      }
    } else if (msg.type === 'result') {
      info.sessionId = msg.session_id || info.sessionId;
      info.summary = typeof msg.result === 'string' ? msg.result : null;
      info.costUsd = msg.total_cost_usd ?? msg.cost_usd ?? null;
      info.status = msg.is_error || msg.subtype !== 'success' ? 'failed' : 'completed';
      push({ type: 'result', text: info.summary || msg.subtype });
      emit('job.updated', info);
    }
  }

  handleTool(block, info, project, push, existing) {
    const input = block.input || {};
    const file = input.file_path || input.notebook_path;
    if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(block.name) && file) {
      const abs = path.resolve(project.dir, file);
      const rel = (path.relative(project.dir, abs) || file).split(path.sep).join('/');
      const action = existing.has(rel) ? 'modified' : 'created';
      push({ type: 'file', action, path: rel });
      // Count each file once per session; a file created and then edited stays "created".
      if (!info.files.some((f) => f.path === rel)) {
        info.files.push({ path: rel, action });
        this.store.bump(action === 'created' ? 'filesCreated' : 'filesModified');
      }
      existing.add(rel);
      emit('job.updated', info);
    } else {
      const detail = input.pattern || input.path || input.command || input.file_path || '';
      push({ type: 'tool', text: `${block.name}${detail ? ` ${String(detail).slice(0, 160)}` : ''}` });
    }
  }

  cancel(id) {
    const j = this.jobs.get(id);
    if (!j) throw new HttpError(404, 'job_not_found', 'Job not found');
    if (j.info.status === 'running') {
      j.info.cancelled = true;
      killTree(j.child);
    }
    return j.info;
  }

  shutdown() {
    for (const j of this.jobs.values()) killTree(j.child);
  }
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.venv', 'venv', '__pycache__']);

/** Relative paths (with /) of files under dir, bounded. */
function listFiles(dir, max = 20000) {
  const out = new Set();
  const walk = (d, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.size >= max) return;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(d, e.name), rel);
      } else out.add(rel);
    }
  };
  walk(dir, '');
  return out;
}

/** Build the instructions that are shown to the user for approval and then sent to Claude. */
export function buildGenerationPrompt({ name, description, framework, language, prompt }) {
  return [
    `Create a new ${frameworkLabel(framework)} project named "${name}" in the current directory, using ${language}.`,
    description ? `Project description: ${description}` : null,
    '',
    'What to build:',
    prompt.trim(),
    '',
    'Requirements:',
    '- Create every file inside the current directory. Do not touch anything outside it.',
    '- Write the files directly instead of running scaffolding generators.',
    '- Include a package.json (or requirements.txt for Python) with a "dev" script that starts a local development server where it makes sense.',
    '- Add a short README.md explaining how to install and run the project.',
    '- Do not install packages globally and do not add secrets or API keys to the code.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export const FRAMEWORKS = {
  react: 'React',
  'vite-react': 'Vite + React',
  nextjs: 'Next.js',
  vite: 'Vite',
  node: 'Node.js',
  python: 'Python',
  html: 'HTML, CSS and JavaScript',
};

function frameworkLabel(f) {
  return FRAMEWORKS[f] || f;
}
