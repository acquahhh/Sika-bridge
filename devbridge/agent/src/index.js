#!/usr/bin/env node
import { loadConfig } from './config.js';
import { createAgent } from './server.js';
import { detectClaude } from './claude.js';

const HELP = `DevBridge local agent

Usage: node src/index.js [options]

  --workspace <folder>     Folder where projects are created (default ~/DevBridgeProjects)
  --port <n>               Port on 127.0.0.1 (default 4317)
  --allow-origin <url>     Allow another browser origin (repeatable)
  --data-dir <folder>      Where config.json and state.json live (default ~/.devbridge)
  --rotate-token           Generate a new access token
`;

let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
if (cfg.help) {
  console.log(HELP);
  process.exit(0);
}

const { server, shutdown } = createAgent(cfg);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${cfg.port} is already in use. Is another agent running? Use --port to choose another.`);
  else console.error(e);
  process.exit(1);
});

server.listen(cfg.port, cfg.host, async () => {
  const c = await detectClaude();
  console.log(`
  DevBridge agent ready on http://${cfg.host}:${cfg.port}

  Workspace      ${cfg.workspaceRoot}
  Claude Code    ${c.installed ? c.version : `NOT FOUND - ${c.hint}`}
  Origins        ${cfg.allowedOrigins.join(', ')}
  Config         ${cfg.file}

  Access token (paste into DevBridge > Settings > Local agent):

      ${cfg.token}
`);
});

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log('\nStopping agent and child processes...');
    shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
