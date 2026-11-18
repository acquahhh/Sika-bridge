import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classify, tokenize } from '../src/policy.js';
import { resolveInside, slugify } from '../src/paths.js';
import { loadConfig } from '../src/config.js';
import { createAgent } from '../src/server.js';

test('tokenize handles quotes', () => {
  assert.deepEqual(tokenize('npm run "dev server" x'), ['npm', 'run', 'dev server', 'x']);
});

test('policy allows everyday commands', () => {
  for (const c of ['npm install', 'npm run dev', 'npm test', 'git status', 'node server.js', 'py app.py', 'pip install -r requirements.txt']) {
    assert.equal(classify(c).decision, 'allow', c);
  }
});

test('policy asks before risky commands', () => {
  for (const c of ['npm install lodash', 'npm publish', 'git push', 'git reset --hard', 'npx create-vite', 'node -e 1', 'npm install -g x', 'node ../other.js', 'pip uninstall flask']) {
    assert.equal(classify(c).decision, 'approval', c);
  }
});

test('policy rejects shell tricks and unknown executables', () => {
  for (const c of ['rm -rf /', 'powershell -c x', 'npm run dev && del *', 'npm run dev | x', 'git log > out.txt', 'npm run $(whoami)', 'cmd /c dir']) {
    assert.equal(classify(c).decision, 'reject', c);
  }
});

test('strict policy turns approvals into rejections', () => {
  assert.equal(classify('git push', 'strict').decision, 'reject');
  assert.equal(classify('npm run dev', 'strict').decision, 'allow');
});

test('resolveInside keeps paths in the workspace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbws-'));
  assert.equal(resolveInside(root, 'a/b'), path.join(fs.realpathSync(root), 'a', 'b'));
  for (const bad of ['../x', '/etc', 'C:\\Windows', 'a/../../x', 'a/%TEMP%']) {
    assert.throws(() => resolveInside(root, bad), bad);
  }
  assert.equal(slugify('  Student Finance Tracker! '), 'student-finance-tracker');
});

let agent;
let base;
let token;
before(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'dbdata-'));
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'dbws-'));
  const cfg = loadConfig(['--data-dir', data, '--workspace', ws, '--port', '0']);
  agent = createAgent(cfg);
  await new Promise((r) => agent.server.listen(0, '127.0.0.1', r));
  cfg.port = agent.server.address().port;
  base = `http://127.0.0.1:${cfg.port}`;
  token = cfg.token;
});
after(() => {
  agent.shutdown();
  agent.server.close();
});

test('API requires the token', async () => {
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/projects`)).status, 401);
  const ok = await fetch(`${base}/api/projects`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(ok.status, 200);
});

test('API rejects foreign origins', async () => {
  const r = await fetch(`${base}/api/projects`, { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

test('import, run a command, and refuse a dangerous one', async () => {
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const settings = await (await fetch(`${base}/api/settings`, { headers: h })).json();
  fs.mkdirSync(path.join(settings.workspaceRoot, 'demo'));
  fs.writeFileSync(path.join(settings.workspaceRoot, 'demo', 'hello.js'), 'console.log("hi from project")');
  const p = await (await fetch(`${base}/api/projects/import`, { method: 'POST', headers: h, body: JSON.stringify({ name: 'Demo', folder: 'demo' }) })).json();
  assert.equal(p.name, 'Demo');

  const run = await (await fetch(`${base}/api/commands`, { method: 'POST', headers: h, body: JSON.stringify({ projectId: p.id, command: 'node hello.js' }) })).json();
  assert.equal(run.status, 'running');
  await new Promise((r) => setTimeout(r, 800));
  const out = await (await fetch(`${base}/api/processes/${run.id}/output`, { headers: h })).json();
  assert.ok(out.some((l) => l.text.includes('hi from project')));

  const bad = await (await fetch(`${base}/api/commands`, { method: 'POST', headers: h, body: JSON.stringify({ projectId: p.id, command: 'rm -rf /' }) })).json();
  assert.equal(bad.status, 'rejected');

  const ask = await (await fetch(`${base}/api/commands`, { method: 'POST', headers: h, body: JSON.stringify({ projectId: p.id, command: 'node -e "console.log(1)"' }) })).json();
  assert.equal(ask.status, 'pending_approval');

  const locked = await fetch(`${base}/api/settings`, { method: 'PATCH', headers: h, body: JSON.stringify({ workspaceRoot: '/' }) });
  assert.equal(locked.status, 400);

  const del = await fetch(`${base}/api/projects/${p.id}`, { method: 'DELETE', headers: h, body: JSON.stringify({ confirmName: 'wrong' }) });
  assert.equal(del.status, 400);
});
