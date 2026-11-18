import { useState, type ReactNode } from 'react';
import { PlugZap, Bot, FolderOpen, Layers, ShieldCheck, Palette, Stethoscope, Eye, EyeOff, CheckCircle2, XCircle, AlertTriangle, Copy, FlaskConical, RefreshCw, Unplug } from 'lucide-react';
import { useAgent, type Theme } from '../lib/agent';
import { AgentClient, isLoopbackUrl } from '../lib/client';
import { FRAMEWORKS, type DiagnosticCheck, type FrameworkId } from '../lib/types';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, StatusDot, Toggle, cx } from '../components/ui';
import { connMeta, useClaudeState } from '../components/Layout';

export default function Settings() {
  const { prefs, setPrefs, conn, connError, reconnect, settings, status, act, notify } = useAgent();
  const claude = useClaudeState();
  const [url, setUrl] = useState(prefs.agentUrl);
  const [token, setToken] = useState(prefs.token);
  const [show, setShow] = useState(false);
  const [checks, setChecks] = useState<DiagnosticCheck[] | null>(null);
  const [running, setRunning] = useState(false);
  const connected = conn === 'connected';

  const save = () => {
    if (!isLoopbackUrl(url.trim())) {
      notify({ tone: 'error', title: 'Agent URL must be on this computer', body: 'Use http://127.0.0.1:<port> or http://localhost:<port>.' });
      return;
    }
    setPrefs({ agentUrl: url.trim().replace(/\/+$/, ''), token: token.trim() });
    reconnect();
  };

  const patch = (p: Parameters<AgentClient['patchSettings']>[0]) => act((c) => c.patchSettings(p), 'Settings saved');

  async function diagnose() {
    setRunning(true);
    const local: DiagnosticCheck[] = [];
    const agentUrl = url.trim().replace(/\/+$/, '');
    const loop = isLoopbackUrl(agentUrl);
    local.push({ id: 'url', label: 'Agent URL points to this computer', status: loop ? 'pass' : 'fail', detail: agentUrl, hint: 'Use http://127.0.0.1:4317 unless you started the agent with --port.' });
    local.push({ id: 'token', label: 'Access token entered', status: token.trim() ? 'pass' : 'fail', hint: 'Copy the token the agent prints when it starts.' });
    if (loop) {
      try {
        const res = await fetch(`${agentUrl}/api/health`);
        if (res.status === 403) {
          local.push({ id: 'reach', label: 'Agent reachable', status: 'fail', detail: `Origin ${location.origin} is not allowed`, hint: `Start the agent with --allow-origin ${location.origin}` });
        } else {
          const h = await res.json();
          local.push({ id: 'reach', label: 'Agent reachable', status: 'pass', detail: `${h.name} v${h.version}` });
        }
      } catch {
        local.push({ id: 'reach', label: 'Agent reachable', status: 'fail', detail: `No response from ${agentUrl}`, hint: 'Start it with "npm start" in devbridge/agent. Check the port, and that a firewall or browser extension is not blocking localhost.' });
      }
    }
    let remote: DiagnosticCheck[] = [];
    if (loop && token.trim()) {
      try {
        remote = (await new AgentClient(agentUrl, token.trim()).diagnostics()).checks;
      } catch (e) {
        remote = [{ id: 'auth', label: 'Token accepted', status: 'fail', detail: (e as Error).message }];
      }
    }
    local.push({ id: 'ws', label: 'Live event stream', status: connected ? 'pass' : 'warn', detail: connected ? 'Connected' : connMeta[conn].label, hint: 'Save the URL and token to connect.' });
    setChecks([...local, ...remote]);
    setRunning(false);
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Connection, permissions and preferences." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={<PlugZap className="h-4 w-4" />} title="Local agent connection" subtitle="The agent runs on your computer. This page only ever talks to it over 127.0.0.1.">
          <div className="mb-4 flex items-center gap-2 text-sm">
            <StatusDot tone={connMeta[conn].tone} pulse={connected} />
            <span className="font-medium">{connMeta[conn].label}</span>
            {connected && status && <span className="text-xs text-muted">· v{status.agent.version} on {status.agent.hostname}</span>}
          </div>
          {connError && !connected && <p className="mb-4 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">{connError}</p>}
          <div className="space-y-3">
            <Field label="Agent URL">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:4317" className="font-mono" />
            </Field>
            <Field label="Access token" hint="Printed in the agent's console when it starts. Stored in this browser only.">
              <div className="relative">
                <Input type={show ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste token" className="pr-10 font-mono" autoComplete="off" spellCheck={false} />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-faint hover:text-fg" aria-label={show ? 'Hide token' : 'Show token'}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Row label="Remember token on this device" hint="Off keeps it only for this browser tab session.">
              <Toggle label="Remember token" checked={prefs.remember} onChange={(v) => setPrefs({ remember: v })} />
            </Row>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="primary" onClick={save} icon={<PlugZap className="h-4 w-4" />}>{connected ? 'Save & reconnect' : 'Connect'}</Button>
              {prefs.token && (
                <Button variant="ghost" icon={<Unplug className="h-4 w-4" />} onClick={() => { setPrefs({ token: '' }); setToken(''); }}>Disconnect</Button>
              )}
            </div>
          </div>
          <div className="mt-5 rounded-lg border border-line bg-bg/50 p-3 text-xs text-muted">
            <p className="mb-2 font-medium text-fg">Start the agent (Windows PowerShell)</p>
            <Code>{'cd devbridge\\agent\nnpm install\nnpm start'}</Code>
          </div>
        </Section>

        <Section icon={<Bot className="h-4 w-4" />} title="Claude Code CLI detection" subtitle="Detected by the agent running claude --version.">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <StatusDot tone={claude.tone} pulse={claude.tone === 'ok'} />
              <span className="font-medium">{claude.label}</span>
            </div>
            <Button size="sm" disabled={!connected} icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={diagnose}>Re-check</Button>
          </div>
          <p className="mt-2 break-words text-xs text-muted">{claude.detail}</p>
          {claude.tone === 'bad' && (
            <div className="mt-4 rounded-lg border border-line bg-bg/50 p-3 text-xs text-muted">
              <p className="mb-2 font-medium text-fg">Install and sign in</p>
              <Code>{'npm install -g @anthropic-ai/claude-code\nclaude'}</Code>
              <p className="mt-2">Run <span className="font-mono">claude</span> once to sign in, then restart the agent.</p>
            </div>
          )}
          <div className="mt-5 space-y-3 border-t border-line/60 pt-4">
            <Row label="Allow Claude to install packages" hint="Lets Claude run npm install / pip install while generating. Other shell commands stay blocked.">
              <Toggle label="Allow installs" disabled={!connected} checked={!!settings?.claudeAllowInstalls} onChange={(v) => patch({ claudeAllowInstalls: v })} />
            </Row>
            <Field label="Model (optional)" hint="Passed to claude --model. Leave empty for your Claude Code default.">
              <Input disabled={!connected} defaultValue={settings?.claudeModel ?? ''} key={settings?.claudeModel} placeholder="default" onBlur={(e) => e.target.value !== (settings?.claudeModel ?? '') && patch({ claudeModel: e.target.value.trim() })} className="font-mono" />
            </Field>
          </div>
        </Section>

        <Section icon={<FolderOpen className="h-4 w-4" />} title="Workspace directory" subtitle="All projects live here. The agent refuses paths outside it.">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-bg/50 px-3 py-2">
            <span className="flex-1 truncate font-mono text-sm">{settings?.workspaceRoot ?? '—'}</span>
            {settings && <Button size="sm" variant="ghost" aria-label="Copy path" onClick={() => navigator.clipboard?.writeText(settings.workspaceRoot)}><Copy className="h-3.5 w-3.5" /></Button>}
          </div>
          <p className="mt-3 text-xs text-muted">
            For safety the workspace can't be changed from the browser. Restart the agent with
            <span className="mx-1 font-mono text-fg">npm start -- --workspace "D:\Code"</span>
            or edit <span className="font-mono text-fg">workspaceRoot</span> in <span className="break-all font-mono text-fg">{settings?.configFile ?? '~/.devbridge/config.json'}</span>.
          </p>
        </Section>

        <Section icon={<Layers className="h-4 w-4" />} title="Default project framework">
          <Select disabled={!connected} value={settings?.defaultFramework ?? 'vite-react'} onChange={(e) => patch({ defaultFramework: e.target.value as FrameworkId })}>
            {FRAMEWORKS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </Select>
          <p className="mt-2 text-xs text-faint">Pre-selected in the AI Project Builder.</p>
        </Section>

        <Section icon={<ShieldCheck className="h-4 w-4" />} title="Terminal permissions" subtitle="How the agent treats commands that could change or delete data.">
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['ask', 'Ask for risky commands', 'Safe commands run immediately. Risky ones wait for you to approve them in Live Terminal.'],
              ['strict', 'Strict', 'Risky commands are blocked outright. Only safe commands can run.'],
            ] as const).map(([id, label, body]) => (
              <button
                key={id}
                disabled={!connected}
                onClick={() => patch({ terminalPolicy: id })}
                className={cx('rounded-lg border p-3 text-left transition disabled:opacity-50', settings?.terminalPolicy === id ? 'border-accent/70 bg-accent/10' : 'border-line hover:border-accent/40')}
              >
                <div className="text-sm font-medium">{label}</div>
                <div className="mt-1 text-xs text-muted">{body}</div>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-faint">Commands outside the allow-list, and any pipes, redirects or chaining, are always refused.</p>
        </Section>

        <Section icon={<Palette className="h-4 w-4" />} title="Theme and display">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['dark', 'Navy', 'bg-[#090c16]'],
              ['midnight', 'Midnight', 'bg-[#04060c]'],
              ['light', 'Light', 'bg-[#f6f7fb]'],
            ] as [Theme, string, string][]).map(([id, label, sw]) => (
              <button key={id} onClick={() => setPrefs({ theme: id })} className={cx('rounded-lg border p-2 text-left transition', prefs.theme === id ? 'border-accent/70 ring-2 ring-accent/20' : 'border-line hover:border-accent/40')}>
                <div className={cx('mb-2 h-10 rounded-md border border-line', sw)}>
                  <div className="m-1.5 h-1.5 w-8 rounded bg-gradient-to-r from-[#4f7cff] to-[#8b5cf6]" />
                </div>
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-line/60 pt-4">
            <Row label={<span className="flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5 text-warn" /> Show demo data when no agent is connected</span>} hint="Sample projects for exploring the interface. Always labelled “Demo data” and never mixed with real data.">
              <Toggle label="Demo data" checked={prefs.demo} onChange={(v) => setPrefs({ demo: v })} />
            </Row>
          </div>
        </Section>

        <div className="xl:col-span-2">
          <Section
            icon={<Stethoscope className="h-4 w-4" />}
            title="Connection diagnostics"
            subtitle="Checks the browser side and asks the agent to check Node.js, the workspace, Claude Code and VS Code."
            action={<Button size="sm" variant="primary" loading={running} onClick={diagnose}>Run diagnostics</Button>}
          >
            {!checks ? (
              <p className="text-sm text-muted">Run diagnostics to see what is working and how to fix what isn't.</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {checks.map((c) => (
                  <li key={c.id + c.label} className="flex items-start gap-3 py-2.5">
                    {c.status === 'pass' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : c.status === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {c.label}
                        <Badge tone={c.status === 'pass' ? 'ok' : c.status === 'warn' ? 'warn' : 'bad'}>{c.status}</Badge>
                      </div>
                      {c.detail && <p className="mt-0.5 break-all font-mono text-xs text-muted">{c.detail}</p>}
                      {c.status !== 'pass' && c.hint && <p className="mt-1 text-xs text-accent">{c.hint}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-faint">This page is served from <span className="font-mono">{location.origin}</span>. {settings && !settings.allowedOrigins.includes(location.origin) ? 'That origin is not in the agent\'s allowed list.' : 'The agent must list this origin in allowedOrigins.'}</p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, subtitle, action, children }: { icon: ReactNode; title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} subtitle={subtitle} action={action} />
      <div className="p-5">{children}</div>
    </Card>
  );
}

function Row({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-md border border-line bg-[#060912] p-2.5 font-mono text-[11.5px] leading-relaxed text-slate-300">{children}</pre>;
}
