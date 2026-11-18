// Process spawning without a shell on macOS/Linux. On Windows, npm, npx,
// code and claude are .cmd shims that Node can only start through cmd.exe,
// so every argument is checked for cmd metacharacters and quoted. Free text
// such as Claude prompts is passed on stdin, never as an argument.
import { spawn, execFile } from 'node:child_process';
import { SHELL_META } from './paths.js';

const IS_WIN = process.platform === 'win32';

export class SpawnError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'spawn_rejected';
  }
}

function quoteWin(arg) {
  if (SHELL_META.test(arg)) throw new SpawnError(`Argument contains a character that is not allowed: ${arg}`);
  return /[\s()]/.test(arg) || arg === '' ? `"${arg}"` : arg;
}

/** Spawn `cmd args` in `cwd`. Returns the ChildProcess. */
export function safeSpawn(cmd, args, { cwd, env, stdin = 'ignore' } = {}) {
  if (!/^[A-Za-z0-9._\-]+$/.test(cmd)) throw new SpawnError(`Executable name not allowed: ${cmd}`);
  const base = {
    cwd,
    env: { ...process.env, FORCE_COLOR: '0', ...env },
    stdio: [stdin, 'pipe', 'pipe'],
    windowsHide: true,
  };
  if (IS_WIN) {
    const line = [cmd, ...args.map(quoteWin)].join(' ');
    return spawn(line, { ...base, shell: true });
  }
  // Own process group so the whole tree can be stopped.
  return spawn(cmd, args, { ...base, detached: true });
}

/** Stop a process and its children. */
export function killTree(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  if (IS_WIN) {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
    setTimeout(() => {
      if (child.exitCode === null) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    }, 4000).unref();
  }
}

/** Run a short command and collect output (used for detection). */
export function runCapture(cmd, args, { cwd, timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let child;
    try {
      child = safeSpawn(cmd, args, { cwd });
    } catch (e) {
      resolve({ ok: false, code: null, stdout: '', stderr: e.message });
      return;
    }
    const timer = setTimeout(() => killTree(child), timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout: out, stderr: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout: out.trim(), stderr: err.trim() });
    });
  });
}
