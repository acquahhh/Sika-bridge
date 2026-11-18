# DevBridge

A browser workspace for building software on **your own computer** with Claude Code.
You describe an app, review the exact instructions, and a small local agent runs the
Claude Code CLI inside a project folder. Then you run, preview and manage the project.
DevBridge does not depend on any VS Code extension. It only calls the `code` command
to open a folder.

```
┌──────────────────────┐   HTTP + WebSocket    ┌──────────────────────────┐
│ web/  (React UI)     │ ───────────────────▶ │ agent/  (Node.js)        │
│ http://127.0.0.1:5173│   127.0.0.1 only      │ http://127.0.0.1:4317    │
│ no filesystem access │   bearer token        │  ├─ claude -p (stream)   │
│ no API keys          │   origin allow-list   │  ├─ allow-listed commands│
└──────────────────────┘                       │  ├─ dev servers          │
                                               │  └─ workspace folder only│
                                               └──────────────────────────┘
```

| Folder | What |
| --- | --- |
| [`web/`](web) | React 18 + TypeScript + Tailwind UI: Overview, AI Project Builder, My Projects, Live Terminal, Live Preview, Settings |
| [`agent/`](agent) | Node.js 20+ agent: Express API, `ws` event stream, Claude Code CLI integration, command policy, process manager |

## Quick start (Windows PowerShell)

Requirements: Node.js 20+, Claude Code (`npm install -g @anthropic-ai/claude-code`, then run
`claude` once to sign in), and optionally VS Code with `code` on PATH.

```powershell
# 1. Start the agent (keep this window open)
cd devbridge\agent
npm install
npm start          # or: npm start -- --workspace "D:\Code\DevBridge"
```

The agent prints its **access token**. In a second window:

```powershell
# 2. Start the UI
cd devbridge\web
npm install
npm run dev
```

Open http://127.0.0.1:5173, go to **Settings → Local agent connection**, paste the
token and click **Connect**. **Run diagnostics** checks Node.js, the workspace,
Claude Code, VS Code and the browser side, and says how to fix whatever fails.

Agent options: `--workspace <folder>`, `--port <n>`, `--allow-origin <url>`
(repeatable), `--data-dir <folder>`, `--rotate-token`. Config and state are kept in
`%USERPROFILE%\.devbridge\` (`config.json`, `state.json`).

## What is real and what is demo

* Every number, project, log line and status comes from the agent. When no agent is
  connected the UI shows "—" and empty states. It never estimates or invents values.
* **Demo data** is off by default. You can turn it on in Settings to explore the
  interface without an agent. Every screen then shows a "Demo data" badge, all
  actions are disabled, and demo data is never mixed with real data.
* The agent has been exercised end to end on Linux with a stand-in `claude` script
  that emits the CLI's `stream-json` format. The Windows-specific paths (cmd shims,
  `taskkill`) are written for Windows but were not run on a Windows machine here.

## How generation works

1. In **AI Project Builder** you enter a prompt, name, description, framework, language
   and workspace sub-folder.
2. **Create project** asks the agent to compose the instructions
   (`POST /api/projects/preview-prompt`). You can review and edit them.
3. **Approve & create** sends exactly the approved text. The agent creates the folder
   and runs:
   ```
   claude -p --output-format stream-json --verbose --permission-mode acceptEdits \
          --allowedTools Read,Write,Edit,MultiEdit,Glob,Grep,LS,TodoWrite
   ```
   with the project folder as its working directory and the prompt on **stdin**.
   If you enable "Allow Claude to install packages" in Settings, the agent also adds
   `Bash(npm install:*)` and `Bash(pip install:*)`. Claude may not run any other shell
   commands.
4. The agent parses the stream and pushes messages, tool calls and created or modified
   files to the UI over the WebSocket. The Claude session id is saved, so
   **Continue with Claude** resumes it with `--resume`.

## Security model

| Concern | What the agent does |
| --- | --- |
| Network exposure | Listens on `127.0.0.1` only |
| Other websites calling the agent | `Origin` must be on `allowedOrigins` (default `http://localhost:5173`, `http://127.0.0.1:5173`). Hosted origins have to be added on the agent side (`--allow-origin`); the browser cannot add them |
| DNS rebinding | `Host` header must be `127.0.0.1:<port>` or `localhost:<port>` |
| Authentication | Random 192-bit token (`config.json`, mode 600), compared in constant time. WebSocket clients authenticate in their first message, not in the URL |
| Filesystem | Every path is resolved inside the workspace root, including symlinked parents. Only simple folder names are accepted. The workspace root, port and origins **cannot** be changed from the browser |
| Commands | No shell strings. Commands are tokenised, the executable must be on the allow-list (`npm npx pnpm yarn node tsc python python3 py pip pip3 git code`), and pipes, redirects, chaining and `$`/`%` expansion are refused. Risky commands (publish, uninstall, global or force flags, `git push/reset/clean…`, `npx <pkg>`, `node -e`, `python -c`, paths outside the project) wait in an approval queue for 5 minutes. Under the **Strict** policy they are refused instead |
| Windows `.cmd` shims | Spawned through `cmd.exe` with each argument quoted. Arguments containing `" % ^ & \| < > ! \` $` are refused. Prompts go on stdin |
| Secrets | The agent never handles API keys. Claude Code uses its own login on your machine |
| Deleting projects | Requires typing the project name. Deleting files on disk is a separate opt-in checkbox and is re-checked against the workspace root |

`npm run dev` / `npm start` run scripts from the project's own `package.json`. Those
scripts are code in your project, so review what Claude wrote before running it.

## Agent API

All routes except `/api/health` need `Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness (no auth) |
| GET | `/api/status` | Agent info, Claude Code detection, stats |
| GET | `/api/diagnostics` | Node, workspace, Claude, VS Code and origin checks with hints |
| GET/PATCH | `/api/settings` | `defaultFramework`, `terminalPolicy` (`ask`/`strict`), `claudeAllowInstalls`, `claudeModel` |
| GET | `/api/stats`, `/api/activity` | Counters and the activity feed |
| GET | `/api/workspace/folders` | Sub-folders of the workspace |
| GET | `/api/projects`, `/api/projects/:id`, `/api/projects/:id/tree` | Projects and their file tree |
| POST | `/api/projects/preview-prompt` | Compose instructions for review |
| POST | `/api/projects` | Create and generate (`approvedPrompt` required) |
| POST | `/api/projects/import` | Register an existing workspace folder |
| DELETE | `/api/projects/:id` | `{ confirmName, deleteFiles }` |
| POST | `/api/projects/:id/open-vscode` | `code <dir>` |
| POST | `/api/projects/:id/claude` | Continue coding `{ prompt }` |
| GET/POST | `/api/jobs`, `/api/jobs/:id`, `/api/jobs/:id/cancel` | Claude Code sessions |
| GET/POST | `/api/commands` | History / run `{ projectId, command }` → `running`, `pending_approval` or `rejected` |
| GET/POST | `/api/approvals`, `/api/approvals/:id` | Pending approvals / `{ approve: true\|false }` |
| GET/POST | `/api/processes`, `/api/processes/:id/output`, `/api/processes/:id/stop` | Processes |
| GET/POST | `/api/servers`, `/api/projects/:id/server/{start,stop,restart}` | Dev servers (URL and port read from their output) |

WebSocket `ws://127.0.0.1:4317/ws`: send `{"type":"auth","token":"…"}` first. Events:
`project.updated`, `project.removed`, `job.updated`, `job.log`, `process.started`,
`process.output`, `process.exit`, `command.rejected`, `approval.requested`,
`approval.resolved`, `server.updated`, `activity`, `stats`, `settings.updated`.
The TypeScript shapes are in [`web/src/lib/types.ts`](web/src/lib/types.ts).

## Development

```bash
cd devbridge/agent && npm test        # policy, path and API tests (node:test)
cd devbridge/web && npm run build     # type-check and production build
```
