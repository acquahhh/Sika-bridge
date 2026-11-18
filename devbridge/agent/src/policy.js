// Terminal command policy. The browser never sends a shell string that is
// executed as-is: a command is tokenised, the executable must be on an
// allow-list, and anything that can delete data, publish, reach outside the
// project or run inline code needs explicit approval (or is refused when the
// policy is "strict").
import { SHELL_META } from './paths.js';

export const ALLOWED_EXECUTABLES = [
  'npm', 'npx', 'pnpm', 'yarn', 'node', 'tsc',
  'python', 'python3', 'py', 'pip', 'pip3',
  'git', 'code',
];

/** Split a command line into argv. Supports '...' and "..." quoting. */
export function tokenize(line) {
  const out = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (quote) throw new Error('Unclosed quote');
  if (has || cur) out.push(cur);
  return out;
}

const CHAINING = /(&&|\|\||[;|<>`]|\$\(|\r|\n)/;

function needs(reason) {
  return { decision: 'approval', reason };
}

/**
 * Classify a command.
 * @returns {{decision:'allow'|'approval'|'reject', reason:string, argv?:string[]}}
 */
export function classify(line, policy = 'ask') {
  const raw = String(line || '').trim();
  if (!raw) return { decision: 'reject', reason: 'Empty command' };
  if (raw.length > 500) return { decision: 'reject', reason: 'Command is too long' };
  if (CHAINING.test(raw)) {
    return { decision: 'reject', reason: 'Pipes, redirection and command chaining are not supported. Run one command at a time.' };
  }
  let argv;
  try {
    argv = tokenize(raw);
  } catch (e) {
    return { decision: 'reject', reason: e.message };
  }
  const [exe, ...args] = argv;
  const name = exe.toLowerCase().replace(/\.(cmd|exe)$/, '');
  if (!ALLOWED_EXECUTABLES.includes(name)) {
    return {
      decision: 'reject',
      reason: `"${exe}" is not on the agent's allow-list (${ALLOWED_EXECUTABLES.join(', ')}).`,
    };
  }
  if (args.some((a) => SHELL_META.test(a))) {
    return { decision: 'reject', reason: 'Arguments may not contain " % ^ & | < > ! ` or $' };
  }

  const verdict = risk(name, args);
  const result = { ...verdict, argv: [name, ...args] };
  if (result.decision === 'approval' && policy === 'strict') {
    return { decision: 'reject', reason: `${verdict.reason} (blocked by the strict terminal policy)`, argv: result.argv };
  }
  return result;
}

function risk(name, args) {
  const a0 = (args[0] || '').toLowerCase();
  const flags = args.map((x) => x.toLowerCase());

  // Anything that points outside the project directory.
  if (args.some((x) => /^([a-zA-Z]:|[\\/]|~)/.test(x) || /(^|[\\/])\.\.([\\/]|$)/.test(x))) {
    return needs('Refers to a path outside the project');
  }
  if (flags.some((f) => f === '--force' || f === '-f' || f === '--hard' || f === '-g' || f === '--global')) {
    return needs('Uses a force or global flag');
  }

  switch (name) {
    case 'npm':
    case 'pnpm':
    case 'yarn':
      if (['publish', 'unpublish', 'uninstall', 'remove', 'rm', 'un', 'r', 'link', 'exec', 'x', 'dlx', 'login', 'adduser', 'token', 'owner', 'access', 'config', 'set'].includes(a0)) {
        return needs(`"${name} ${a0}" can publish, remove or change configuration`);
      }
      if (['install', 'i', 'ci', 'add'].includes(a0) && args.length > 1 && name !== 'yarn') {
        return needs('Installs new packages from the registry');
      }
      if (name === 'yarn' && a0 === 'add') return needs('Installs new packages from the registry');
      return { decision: 'allow', reason: 'Package script or install from the lockfile' };
    case 'npx':
      if (a0 === 'tsc' || a0 === 'vite' || a0 === 'next' || a0 === 'eslint' || a0 === 'prettier') {
        return { decision: 'allow', reason: 'Project-local tool' };
      }
      return needs('npx can download and run any package');
    case 'node':
      if (flags.some((f) => ['-e', '--eval', '-p', '--print'].includes(f))) return needs('Runs inline code');
      return { decision: 'allow', reason: 'Runs a project file' };
    case 'python':
    case 'python3':
    case 'py':
      if (flags.includes('-c')) return needs('Runs inline code');
      if (flags[0] === '-m' && flags[1] === 'pip') return pipRisk(args.slice(2));
      return { decision: 'allow', reason: 'Runs a project file or module' };
    case 'pip':
    case 'pip3':
      return pipRisk(args);
    case 'git':
      if (['status', 'log', 'diff', 'show', 'branch', 'add', 'commit', 'init', 'stash', 'fetch', 'remote'].includes(a0)) {
        if (a0 === 'branch' && flags.some((f) => f === '-d')) return needs('Deletes a branch');
        return { decision: 'allow', reason: 'Read-only or local git operation' };
      }
      return needs(`"git ${a0}" can rewrite history, discard work or reach a remote`);
    case 'code':
      return { decision: 'allow', reason: 'Opens VS Code' };
    case 'tsc':
      return { decision: 'allow', reason: 'TypeScript compiler' };
    default:
      return needs('Unknown command');
  }
}

function pipRisk(args) {
  const a0 = (args[0] || '').toLowerCase();
  if (a0 === 'install' && args[1] === '-r') return { decision: 'allow', reason: 'Installs from a requirements file' };
  if (['list', 'show', 'freeze', 'check'].includes(a0)) return { decision: 'allow', reason: 'Read-only pip command' };
  return needs(`"pip ${a0}" changes installed packages`);
}
