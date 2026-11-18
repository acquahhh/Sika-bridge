// Agent configuration. Everything that widens what the agent may touch
// (workspace root, allowed origins, port) is set here or on the command line,
// never from the browser.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const VERSION = '0.1.0';

const DEFAULTS = {
  host: '127.0.0.1',
  port: 4317,
  workspaceRoot: path.join(os.homedir(), 'DevBridgeProjects'),
  allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  // Settings the browser may change (see PATCHABLE_SETTINGS).
  settings: {
    defaultFramework: 'vite-react',
    terminalPolicy: 'ask', // 'ask' | 'strict'
    claudeAllowInstalls: false,
    claudeModel: '',
  },
};

export const PATCHABLE_SETTINGS = {
  defaultFramework: (v) => typeof v === 'string' && v.length < 40,
  terminalPolicy: (v) => v === 'ask' || v === 'strict',
  claudeAllowInstalls: (v) => typeof v === 'boolean',
  claudeModel: (v) => typeof v === 'string' && /^[a-z0-9.\-[\]]{0,60}$/i.test(v),
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--port') out.port = Number(next());
    else if (a === '--workspace') out.workspaceRoot = next();
    else if (a === '--allow-origin') (out.extraOrigins ??= []).push(next());
    else if (a === '--data-dir') out.dataDir = next();
    else if (a === '--rotate-token') out.rotateToken = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

export function loadConfig(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const dataDir = path.resolve(args.dataDir || process.env.DEVBRIDGE_DATA_DIR || path.join(os.homedir(), '.devbridge'));
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, 'config.json');

  let stored = {};
  if (fs.existsSync(file)) {
    try {
      stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`Could not parse ${file}: ${e.message}`);
    }
  }

  const cfg = {
    ...DEFAULTS,
    ...stored,
    settings: { ...DEFAULTS.settings, ...(stored.settings || {}) },
  };
  if (args.port) cfg.port = args.port;
  if (args.workspaceRoot) cfg.workspaceRoot = args.workspaceRoot;
  if (args.extraOrigins) cfg.allowedOrigins = [...new Set([...cfg.allowedOrigins, ...args.extraOrigins])];
  cfg.workspaceRoot = path.resolve(cfg.workspaceRoot);
  if (!cfg.token || args.rotateToken) cfg.token = crypto.randomBytes(24).toString('base64url');

  // The agent only ever listens on loopback.
  cfg.host = '127.0.0.1';
  cfg.dataDir = dataDir;
  cfg.file = file;
  cfg.help = !!args.help;

  fs.mkdirSync(cfg.workspaceRoot, { recursive: true });
  saveConfig(cfg);
  return cfg;
}

export function saveConfig(cfg) {
  const { host, port, workspaceRoot, allowedOrigins, settings, token } = cfg;
  fs.writeFileSync(
    cfg.file,
    JSON.stringify({ port, workspaceRoot, allowedOrigins, settings, token, host }, null, 2),
    { mode: 0o600 },
  );
}
