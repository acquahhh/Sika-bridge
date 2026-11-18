// Terminal commands, approval queue and dev servers.
import fs from 'node:fs';
import path from 'node:path';
import { classify } from './policy.js';
import { safeSpawn, killTree } from './spawn.js';
import { emit, cryptoId, RingLog } from './store.js';

const APPROVAL_TTL_MS = 5 * 60 * 1000;
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):(\d{2,5})/i;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ProcessManager {
  constructor(store, cfg) {
    this.store = store;
    this.cfg = cfg;
    /** @type {Map<string, any>} */
    this.procs = new Map();
    /** @type {Map<string, any>} */
    this.approvals = new Map();
    /** projectId -> server info */
    this.servers = new Map();
  }

  projectDir(projectId) {
    const p = this.store.getProject(projectId);
    if (!p) throw new HttpError(404, 'project_not_found', 'Project not found');
    if (!fs.existsSync(p.dir)) throw new HttpError(409, 'project_missing', `Project folder no longer exists: ${p.dir}`);
    return p;
  }

  // ---------------------------------------------------------------- commands
  /** Request a terminal command. Runs it, queues it for approval, or rejects it. */
  request(projectId, line, { source = 'terminal' } = {}) {
    const project = this.projectDir(projectId);
    const verdict = classify(line, this.cfg.settings.terminalPolicy);
    const base = { id: cryptoId(), projectId, projectName: project.name, command: String(line).trim(), reason: verdict.reason, at: new Date().toISOString(), source };

    if (verdict.decision === 'reject') {
      const entry = { ...base, status: 'rejected' };
      this.store.addHistory(entry);
      emit('command.rejected', entry);
      return entry;
    }
    if (verdict.decision === 'approval') {
      const entry = { ...base, argv: verdict.argv, status: 'pending_approval', expiresAt: new Date(Date.now() + APPROVAL_TTL_MS).toISOString() };
      this.approvals.set(entry.id, entry);
      this.store.addHistory(stripArgv(entry));
      emit('approval.requested', stripArgv(entry));
      return stripArgv(entry);
    }
    return this.start(project, verdict.argv, base);
  }

  listApprovals() {
    this.expireApprovals();
    return [...this.approvals.values()].map(stripArgv);
  }

  expireApprovals() {
    const now = Date.now();
    for (const [id, a] of this.approvals) {
      if (Date.parse(a.expiresAt) < now) {
        this.approvals.delete(id);
        this.setHistoryStatus(id, 'expired');
        emit('approval.resolved', { id, status: 'expired' });
      }
    }
  }

  resolveApproval(id, approve) {
    this.expireApprovals();
    const a = this.approvals.get(id);
    if (!a) throw new HttpError(404, 'approval_not_found', 'This approval request has expired or was already handled');
    this.approvals.delete(id);
    if (!approve) {
      this.setHistoryStatus(id, 'denied');
      emit('approval.resolved', { id, status: 'denied' });
      return { id, status: 'denied' };
    }
    // Re-check: the policy may have become strict in the meantime.
    const verdict = classify(a.command, this.cfg.settings.terminalPolicy);
    if (verdict.decision === 'reject') {
      this.setHistoryStatus(id, 'rejected');
      emit('approval.resolved', { id, status: 'rejected' });
      throw new HttpError(403, 'policy_rejected', verdict.reason);
    }
    emit('approval.resolved', { id, status: 'approved' });
    const project = this.projectDir(a.projectId);
    this.store.data.history = this.store.data.history.filter((h) => h.id !== id);
    return this.start(project, verdict.argv, { ...stripArgv(a), approved: true });
  }

  setHistoryStatus(id, status) {
    const h = this.store.data.history.find((x) => x.id === id);
    if (h) {
      h.status = status;
      this.store.save();
    }
  }

  /** Start an already-classified argv in the project folder. */
  start(project, argv, base, { kind = 'command', onLine } = {}) {
    const [cmd, ...args] = argv;
    const log = new RingLog();
    const info = { ...base, kind, status: 'running', pid: null, exitCode: null, startedAt: new Date().toISOString(), endedAt: null };
    let child;
    try {
      child = safeSpawn(cmd, args, { cwd: project.dir });
    } catch (e) {
      const failed = { ...info, status: 'failed', error: e.message };
      this.store.addHistory(failed);
      emit('process.exit', failed);
      return failed;
    }
    info.pid = child.pid;
    const rec = { info, child, log };
    this.procs.set(info.id, rec);
    this.store.addHistory(info);
    emit('process.started', info);

    const pipe = (stream, channel) => {
      let buf = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        buf += chunk;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop();
        for (const text of lines) send(text, channel);
      });
      stream.on('end', () => buf && send(buf, channel));
    };
    const send = (text, channel) => {
      const level = channel === 'stderr' || /\b(error|err!|failed|exception)\b/i.test(text) ? 'error' : /\bwarn(ing)?\b/i.test(text) ? 'warn' : 'info';
      const line = { processId: info.id, projectId: project.id, channel, level, text, at: Date.now() };
      log.push(line);
      emit('process.output', line);
      onLine?.(line);
    };
    pipe(child.stdout, 'stdout');
    pipe(child.stderr, 'stderr');

    child.on('error', (e) => {
      send(`Could not start "${cmd}": ${e.message}`, 'stderr');
    });
    child.on('close', (code, signal) => {
      info.status = info.stopRequested ? 'stopped' : code === 0 ? 'exited' : 'failed';
      info.exitCode = code;
      info.signal = signal;
      info.endedAt = new Date().toISOString();
      const h = this.store.data.history.find((x) => x.id === info.id);
      if (h) Object.assign(h, { status: info.status, exitCode: code, endedAt: info.endedAt });
      this.store.save();
      emit('process.exit', info);
      // Keep finished processes around briefly for log viewing.
      setTimeout(() => this.procs.delete(info.id), 30 * 60 * 1000).unref();
    });
    return info;
  }

  stop(id) {
    const rec = this.procs.get(id);
    if (!rec) throw new HttpError(404, 'process_not_found', 'Process not found');
    if (rec.info.status === 'running') {
      rec.info.stopRequested = true;
      killTree(rec.child);
    }
    return rec.info;
  }

  listProcesses() {
    return [...this.procs.values()].map((r) => r.info);
  }

  output(id) {
    const rec = this.procs.get(id);
    if (!rec) throw new HttpError(404, 'process_not_found', 'Process not found');
    return rec.log.lines;
  }

  // ----------------------------------------------------------------- servers
  /** Work out how to start a project's dev server from its files. */
  detectDevCommand(project) {
    const pkgFile = path.join(project.dir, 'package.json');
    if (fs.existsSync(pkgFile)) {
      let scripts = {};
      try {
        scripts = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).scripts || {};
      } catch {
        throw new HttpError(409, 'bad_package_json', 'package.json could not be parsed');
      }
      const script = ['dev', 'start', 'serve'].find((s) => scripts[s]);
      if (!script) throw new HttpError(409, 'no_dev_script', 'package.json has no "dev", "start" or "serve" script');
      if (!fs.existsSync(path.join(project.dir, 'node_modules'))) {
        throw new HttpError(409, 'deps_missing', 'Dependencies are not installed. Run "npm install" in the Live Terminal first.');
      }
      return script === 'start' ? ['npm', 'start'] : ['npm', 'run', script];
    }
    const py = process.platform === 'win32' ? 'py' : 'python3';
    for (const f of ['app.py', 'main.py', 'manage.py']) {
      if (fs.existsSync(path.join(project.dir, f))) {
        return f === 'manage.py' ? [py, 'manage.py', 'runserver'] : [py, f];
      }
    }
    if (fs.existsSync(path.join(project.dir, 'index.html'))) {
      return [py, '-m', 'http.server', String(this.freePortGuess()), '--bind', '127.0.0.1'];
    }
    throw new HttpError(409, 'no_entry', 'Could not find package.json, app.py, main.py or index.html to start');
  }

  freePortGuess() {
    const used = new Set([...this.servers.values()].map((s) => s.port));
    let p = 8080;
    while (used.has(p)) p++;
    return p;
  }

  startServer(projectId) {
    const project = this.projectDir(projectId);
    const existing = this.servers.get(projectId);
    if (existing && existing.status !== 'stopped' && existing.status !== 'crashed') {
      throw new HttpError(409, 'already_running', 'The dev server is already running');
    }
    const argv = this.detectDevCommand(project);
    const portArg = argv.includes('http.server') ? Number(argv[3]) : null;
    const server = { projectId, projectName: project.name, command: argv.join(' '), status: 'starting', port: portArg, url: portArg ? `http://127.0.0.1:${portArg}` : null, processId: null, startedAt: new Date().toISOString() };
    this.servers.set(projectId, server);

    const info = this.start(project, argv, { id: cryptoId(), projectId, projectName: project.name, command: server.command, reason: 'Dev server', at: server.startedAt, source: 'preview' }, {
      kind: 'server',
      onLine: (line) => {
        const m = line.text.match(URL_RE);
        if (m && server.status !== 'running') {
          server.port = Number(m[1]);
          server.url = `http://localhost:${server.port}`;
          server.status = 'running';
          emit('server.updated', server);
        }
      },
    });
    server.processId = info.id;
    if (info.status === 'failed') server.status = 'crashed';
    else if (server.port) server.status = 'running';
    const rec = this.procs.get(info.id);
    rec?.child.on('close', () => {
      server.status = rec.info.stopRequested ? 'stopped' : 'crashed';
      emit('server.updated', server);
      // A restart replaces the record; only the current server updates the project.
      if (this.servers.get(projectId) === server) this.store.updateProject(projectId, { status: 'idle' });
    });
    this.store.updateProject(projectId, { status: 'running' });
    this.store.log('server', `Started dev server: ${server.command}`, projectId);
    emit('server.updated', server);
    return server;
  }

  stopServer(projectId) {
    const s = this.servers.get(projectId);
    if (!s || !s.processId) throw new HttpError(404, 'server_not_found', 'No dev server for this project');
    try {
      this.stop(s.processId);
    } catch {
      /* already gone */
    }
    s.status = 'stopped';
    emit('server.updated', s);
    this.store.log('server', 'Stopped dev server', projectId);
    return s;
  }

  async restartServer(projectId) {
    const s = this.servers.get(projectId);
    if (s && s.status !== 'stopped' && s.status !== 'crashed') {
      const rec = this.procs.get(s.processId);
      this.stopServer(projectId);
      if (rec && rec.child.exitCode === null) {
        await new Promise((r) => {
          rec.child.once('close', r);
          setTimeout(r, 6000).unref();
        });
      }
    }
    return this.startServer(projectId);
  }

  listServers() {
    return [...this.servers.values()];
  }

  runningAppCount() {
    return [...this.servers.values()].filter((s) => s.status === 'running' || s.status === 'starting').length;
  }

  shutdown() {
    for (const { child } of this.procs.values()) killTree(child);
  }
}

function stripArgv({ argv, ...rest }) {
  return rest;
}
