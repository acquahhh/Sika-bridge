// HTTP API and WebSocket event stream.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { VERSION, PATCHABLE_SETTINGS, saveConfig } from './config.js';
import { securityMiddleware, hostAllowed, originAllowed, tokenMatches } from './security.js';
import { resolveInside, slugify, readTree, PathError } from './paths.js';
import { Store, bus, emit, cryptoId } from './store.js';
import { ProcessManager, HttpError } from './processes.js';
import { ClaudeJobs, detectClaude, detectVSCode, buildGenerationPrompt, FRAMEWORKS } from './claude.js';
import { safeSpawn } from './spawn.js';

const LANGUAGES = ['TypeScript', 'JavaScript', 'Python', 'HTML/CSS/JS'];

export function createAgent(cfg) {
  const store = new Store(cfg.dataDir);
  const procs = new ProcessManager(store, cfg);
  const jobs = new ClaudeJobs(store, cfg);
  const app = express();
  app.disable('x-powered-by');
  app.use(securityMiddleware(cfg));
  app.use(express.json({ limit: '64kb' }));

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((r) => r !== undefined && res.json(r)).catch(next);
  const project = (id) => {
    const p = store.getProject(id);
    if (!p) throw new HttpError(404, 'project_not_found', 'Project not found');
    return p;
  };
  const str = (v, field, max = 4000, required = true) => {
    if (v == null || v === '') {
      if (required) throw new HttpError(400, 'invalid_input', `${field} is required`);
      return '';
    }
    if (typeof v !== 'string' || v.length > max) throw new HttpError(400, 'invalid_input', `${field} must be text up to ${max} characters`);
    return v.trim();
  };

  const stats = () => ({
    totalProjects: store.listProjects().length,
    activeSessions: jobs.activeCount(),
    filesCreated: store.data.stats.filesCreated,
    filesModified: store.data.stats.filesModified,
    runningApps: procs.runningAppCount(),
  });

  // ------------------------------------------------------------- status
  app.get('/api/health', (req, res) => res.json({ ok: true, name: 'devbridge-agent', version: VERSION }));

  app.get('/api/status', wrap(async () => ({
    agent: { version: VERSION, platform: process.platform, node: process.version, hostname: os.hostname(), uptimeSec: Math.round(process.uptime()), workspaceRoot: cfg.workspaceRoot },
    claude: await detectClaude(),
    stats: stats(),
  })));

  app.get('/api/diagnostics', wrap(async () => {
    const checks = [];
    const add = (id, label, ok, detail, hint) => checks.push({ id, label, status: ok === null ? 'warn' : ok ? 'pass' : 'fail', detail, hint });
    add('agent', 'Agent reachable and token accepted', true, `v${VERSION} on ${process.platform}, Node ${process.version}`);
    const nodeMajor = Number(process.version.slice(1).split('.')[0]);
    add('node', 'Node.js 20 or newer', nodeMajor >= 20, process.version, 'Install Node.js 20 LTS or newer');
    let wsOk = false;
    try {
      fs.accessSync(cfg.workspaceRoot, fs.constants.W_OK);
      wsOk = true;
    } catch {
      /* not writable */
    }
    add('workspace', 'Workspace folder writable', wsOk, cfg.workspaceRoot, `Check permissions on ${cfg.workspaceRoot} or start the agent with --workspace <folder>`);
    const c = await detectClaude({ force: true });
    add('claude', 'Claude Code CLI found', c.installed, c.installed ? c.version : c.error, c.hint);
    const v = await detectVSCode();
    add('vscode', 'VS Code "code" command on PATH', v.installed ? true : null, v.installed ? v.version : v.error, 'In VS Code run "Shell Command: Install \'code\' command in PATH" (on Windows, reinstall with "Add to PATH" ticked)');
    add('origins', 'Allowed browser origins', true, cfg.allowedOrigins.join(', '));
    return { checks, at: new Date().toISOString() };
  }));

  // ----------------------------------------------------------- settings
  app.get('/api/settings', (req, res) => res.json(publicSettings(cfg)));
  app.patch('/api/settings', (req, res) => {
    const body = req.body || {};
    for (const [k, v] of Object.entries(body)) {
      const check = PATCHABLE_SETTINGS[k];
      if (!check) throw new HttpError(400, 'setting_locked', `"${k}" can only be changed in ${cfg.file} or on the agent command line`);
      if (!check(v)) throw new HttpError(400, 'invalid_input', `Invalid value for ${k}`);
    }
    Object.assign(cfg.settings, body);
    saveConfig(cfg);
    emit('settings.updated', publicSettings(cfg));
    res.json(publicSettings(cfg));
  });

  app.get('/api/stats', (req, res) => res.json(stats()));
  app.get('/api/activity', (req, res) => res.json(store.data.activity.slice(0, 50)));

  // ----------------------------------------------------------- projects
  app.get('/api/projects', (req, res) => res.json(store.listProjects().map(withExists)));
  app.get('/api/projects/:id', (req, res) => res.json(withExists(project(req.params.id))));
  app.get('/api/projects/:id/tree', (req, res) => {
    const p = project(req.params.id);
    if (!fs.existsSync(p.dir)) throw new HttpError(409, 'project_missing', 'Project folder no longer exists');
    res.json(readTree(p.dir));
  });

  app.get('/api/workspace/folders', (req, res) => {
    const entries = fs.readdirSync(cfg.workspaceRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
    res.json({ root: cfg.workspaceRoot, folders: entries });
  });

  app.post('/api/projects/preview-prompt', (req, res) => {
    const input = validateProject(req.body);
    res.json({ prompt: buildGenerationPrompt(input), dir: resolveInside(cfg.workspaceRoot, path.join(input.parent, input.folder)) });
  });

  app.post('/api/projects', wrap(async (req) => {
    const input = validateProject(req.body);
    const dir = resolveInside(cfg.workspaceRoot, path.join(input.parent, input.folder));
    if (store.listProjects().some((p) => p.dir === dir)) throw new HttpError(409, 'project_exists', 'A project already uses that folder');
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0 && !req.body.allowExisting) {
      throw new HttpError(409, 'folder_not_empty', `${dir} already exists and is not empty. Choose another folder name, or tick "Use existing folder".`);
    }
    // The user approves the exact instructions in the UI; we only send what they approved.
    const prompt = str(req.body.approvedPrompt, 'approvedPrompt', 12000);
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date().toISOString();
    const p = store.addProject({
      id: cryptoId(),
      name: input.name,
      description: input.description,
      framework: input.framework,
      language: input.language,
      dir,
      status: 'created',
      claudeSessionId: null,
      createdAt: now,
      updatedAt: now,
    });
    store.log('project', `Created project "${p.name}"`, p.id);
    const job = await jobs.run(p, prompt, { kind: 'generate' }).catch((e) => {
      store.updateProject(p.id, { status: 'error' });
      throw e;
    });
    return { project: p, job };
  }));

  app.post('/api/projects/import', (req, res) => {
    const name = str(req.body?.name, 'name', 80);
    const folder = str(req.body?.folder, 'folder', 200);
    const dir = resolveInside(cfg.workspaceRoot, folder);
    if (!fs.existsSync(dir)) throw new HttpError(404, 'folder_missing', `${dir} does not exist`);
    if (store.listProjects().some((p) => p.dir === dir)) throw new HttpError(409, 'project_exists', 'Already registered');
    const now = new Date().toISOString();
    const p = store.addProject({ id: cryptoId(), name, description: '', framework: guessFramework(dir), language: guessLanguage(dir), dir, status: 'idle', claudeSessionId: null, createdAt: now, updatedAt: now });
    store.log('project', `Imported existing folder "${folder}"`, p.id);
    res.json(p);
  });

  app.delete('/api/projects/:id', (req, res) => {
    const p = project(req.params.id);
    const { deleteFiles = false, confirmName } = req.body || {};
    if (confirmName !== p.name) throw new HttpError(400, 'confirmation_mismatch', 'Type the exact project name to confirm');
    if (jobs.list().some((j) => j.projectId === p.id && j.status === 'running')) throw new HttpError(409, 'job_running', 'Cancel the running Claude Code session first');
    try {
      procs.stopServer(p.id);
    } catch {
      /* not running */
    }
    if (deleteFiles && fs.existsSync(p.dir)) {
      // Re-validate that the folder is still inside the workspace before removing it.
      const rel = path.relative(cfg.workspaceRoot, p.dir);
      const safe = resolveInside(cfg.workspaceRoot, rel);
      if (safe === path.resolve(cfg.workspaceRoot)) throw new HttpError(400, 'refused', 'Refusing to delete the workspace root');
      fs.rmSync(safe, { recursive: true, force: true });
    }
    store.removeProject(p.id);
    store.log('project', `Deleted project "${p.name}"${deleteFiles ? ' and its files' : ' (files kept)'}`);
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/open-vscode', (req, res) => {
    const p = project(req.params.id);
    const child = safeSpawn('code', [p.dir], { cwd: p.dir });
    let replied = false;
    child.on('error', (e) => {
      if (!replied) {
        replied = true;
        res.status(503).json({ error: { code: 'vscode_unavailable', message: `Could not run "code": ${e.message}. Add VS Code to PATH.` } });
      }
    });
    child.on('close', (code) => {
      if (replied) return;
      replied = true;
      if (code === 0) {
        store.log('vscode', 'Opened in VS Code', p.id);
        res.json({ ok: true });
      } else {
        res.status(503).json({ error: { code: 'vscode_unavailable', message: `"code" exited with ${code}. Is VS Code installed and on PATH?` } });
      }
    });
  });

  app.post('/api/projects/:id/claude', wrap(async (req) => {
    const p = project(req.params.id);
    const prompt = str(req.body?.prompt, 'prompt', 12000);
    return jobs.run(p, prompt, { kind: 'continue' });
  }));

  // --------------------------------------------------------------- jobs
  app.get('/api/jobs', (req, res) => res.json(jobs.list()));
  app.get('/api/jobs/:id', (req, res) => res.json(jobs.get(req.params.id)));
  app.post('/api/jobs/:id/cancel', (req, res) => res.json(jobs.cancel(req.params.id)));

  // ----------------------------------------------------------- terminal
  app.get('/api/commands', (req, res) => res.json(store.data.history.slice(0, 100)));
  app.post('/api/commands', (req, res) => {
    const projectId = str(req.body?.projectId, 'projectId', 100);
    const command = str(req.body?.command, 'command', 500);
    res.json(procs.request(projectId, command));
  });
  app.get('/api/approvals', (req, res) => res.json(procs.listApprovals()));
  app.post('/api/approvals/:id', (req, res) => res.json(procs.resolveApproval(req.params.id, req.body?.approve === true)));
  app.get('/api/processes', (req, res) => res.json(procs.listProcesses()));
  app.get('/api/processes/:id/output', (req, res) => res.json(procs.output(req.params.id)));
  app.post('/api/processes/:id/stop', (req, res) => res.json(procs.stop(req.params.id)));

  // ------------------------------------------------------------ servers
  app.get('/api/servers', (req, res) => res.json(procs.listServers()));
  app.post('/api/projects/:id/server/start', (req, res) => res.json(procs.startServer(req.params.id)));
  app.post('/api/projects/:id/server/stop', (req, res) => res.json(procs.stopServer(req.params.id)));
  app.post('/api/projects/:id/server/restart', wrap((req) => procs.restartServer(req.params.id)));

  app.use((req, res) => res.status(404).json({ error: { code: 'not_found', message: `No route ${req.method} ${req.path}` } }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err instanceof PathError ? 400 : err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: { code: err.code || 'internal_error', message: status >= 500 && !err.code ? 'Internal agent error (see agent console)' : err.message } });
  });

  // ---------------------------------------------------------- websocket
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws' || !hostAllowed(req.headers.host, cfg.port) || !originAllowed(req.headers.origin, cfg)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws) => {
    let authed = false;
    const timer = setTimeout(() => !authed && ws.close(4401, 'auth timeout'), 5000);
    const forward = (ev) => authed && ws.readyState === ws.OPEN && ws.send(JSON.stringify(ev));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return ws.close(4400, 'bad message');
      }
      if (!authed) {
        if (msg.type === 'auth' && tokenMatches(msg.token, cfg.token)) {
          authed = true;
          clearTimeout(timer);
          ws.send(JSON.stringify({ type: 'hello', data: { version: VERSION, stats: stats() } }));
        } else {
          ws.close(4401, 'unauthorized');
        }
        return;
      }
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    });
    bus.on('event', forward);
    ws.on('close', () => {
      clearTimeout(timer);
      bus.off('event', forward);
    });
  });

  // Periodic stats push so the overview stays live.
  const statsTimer = setInterval(() => emit('stats', stats()), 5000);
  statsTimer.unref();

  function shutdown() {
    procs.shutdown();
    jobs.shutdown();
    store.flush();
  }

  function validateProject(body = {}) {
    const name = str(body.name, 'Project name', 80);
    const framework = str(body.framework, 'Framework', 40);
    if (!FRAMEWORKS[framework]) throw new HttpError(400, 'invalid_input', `Unknown framework. Choose one of: ${Object.keys(FRAMEWORKS).join(', ')}`);
    const language = str(body.language, 'Language', 40);
    if (!LANGUAGES.includes(language)) throw new HttpError(400, 'invalid_input', `Unknown language. Choose one of: ${LANGUAGES.join(', ')}`);
    const folder = slugify(body.folder || name);
    if (!folder) throw new HttpError(400, 'invalid_input', 'Project name must contain letters or digits');
    return {
      name,
      description: str(body.description, 'Description', 1000, false),
      framework,
      language,
      prompt: str(body.prompt, 'Prompt', 8000),
      parent: str(body.parent, 'Workspace folder', 200, false),
      folder,
    };
  }

  return { app, server, shutdown, store };
}

function publicSettings(cfg) {
  return { ...cfg.settings, workspaceRoot: cfg.workspaceRoot, allowedOrigins: cfg.allowedOrigins, port: cfg.port, configFile: cfg.file };
}

function withExists(p) {
  return { ...p, exists: fs.existsSync(p.dir) };
}

function guessFramework(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  if (has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) return 'nextjs';
      if (deps.vite && deps.react) return 'vite-react';
      if (deps.vite) return 'vite';
      if (deps.react) return 'react';
      return 'node';
    } catch {
      return 'node';
    }
  }
  if (has('requirements.txt') || has('pyproject.toml') || has('main.py') || has('app.py')) return 'python';
  return 'html';
}

function guessLanguage(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  if (has('tsconfig.json')) return 'TypeScript';
  if (has('package.json')) return 'JavaScript';
  if (has('requirements.txt') || has('pyproject.toml') || has('main.py') || has('app.py')) return 'Python';
  return 'HTML/CSS/JS';
}
