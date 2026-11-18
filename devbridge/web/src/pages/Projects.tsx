import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Code2, SquareTerminal, Play, ExternalLink, Bot, Trash2, FolderKanban, Plus, FolderInput, FolderTree, Folder, FileText, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { useAgent } from '../lib/agent';
import { FRAMEWORKS, frameworkLabel, type Project, type ProjectStatus, type TreeEntry } from '../lib/types';
import { Badge, Button, Card, DemoBadge, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea, cx } from '../components/ui';
import { JobBadge, JobStream, NeedsAgent } from '../components/shared';
import { dateTime, projectStatusLabel, projectStatusTone, timeAgo } from '../lib/format';

type Sort = 'updated' | 'name' | 'created';

export default function Projects() {
  const { projects, servers, isDemo, act, client } = useAgent();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('updated');
  const [fw, setFw] = useState('');
  const [st, setSt] = useState('');
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [coding, setCoding] = useState<Project | null>(null);
  const [tree, setTree] = useState<Project | null>(null);
  const [importing, setImporting] = useState(false);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return projects
      .filter((p) => !needle || `${p.name} ${p.description} ${p.dir}`.toLowerCase().includes(needle))
      .filter((p) => !fw || p.framework === fw)
      .filter((p) => !st || p.status === st)
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'created' ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [projects, q, fw, st, sort]);

  const guard = (fn: () => void) => () => (isDemo ? undefined : fn());

  return (
    <div>
      <PageHeader
        title="My Projects"
        subtitle="Everything the agent manages in your workspace."
        actions={
          <>
            {isDemo && <DemoBadge />}
            <Button icon={<FolderInput className="h-4 w-4" />} onClick={() => setImporting(true)} disabled={!client}>Import folder</Button>
            <Link to="/builder"><Button variant="primary" icon={<Plus className="h-4 w-4" />}>New project</Button></Link>
          </>
        }
      />
      <NeedsAgent what="list your projects">
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, description or path" className="w-full pl-9" />
          </div>
          <Select value={fw} onChange={(e) => setFw(e.target.value)} className="w-40" aria-label="Framework filter">
            <option value="">All frameworks</option>
            {FRAMEWORKS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </Select>
          <Select value={st} onChange={(e) => setSt(e.target.value)} className="w-36" aria-label="Status filter">
            <option value="">All statuses</option>
            {(Object.keys(projectStatusLabel) as ProjectStatus[]).map((s) => <option key={s} value={s}>{projectStatusLabel[s]}</option>)}
          </Select>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-4 w-4 text-faint" />
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-40" aria-label="Sort">
              <option value="updated">Last modified</option>
              <option value="created">Newest</option>
              <option value="name">Name A–Z</option>
            </Select>
          </div>
        </Card>

        {list.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FolderKanban className="h-5 w-5" />}
              title={projects.length ? 'No projects match your filters' : 'No projects yet'}
              body={projects.length ? 'Try a different search or clear the filters.' : 'Describe an app in the AI Project Builder and Claude Code will create it in your workspace.'}
              action={!projects.length && <Link to="/builder"><Button variant="primary">Open AI Project Builder</Button></Link>}
            />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {list.map((p) => {
              const server = servers[p.id];
              const live = server && (server.status === 'running' || server.status === 'starting');
              return (
                <Card key={p.id} className="group flex flex-col p-5 transition hover:border-accent/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold">{p.name}</h3>
                      {p.description && <p className="mt-0.5 line-clamp-1 text-sm text-muted">{p.description}</p>}
                    </div>
                    <Badge tone={projectStatusTone[p.status]} dot>{projectStatusLabel[p.status]}</Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                    <Meta label="Framework" value={frameworkLabel(p.framework)} />
                    <Meta label="Language" value={p.language} />
                    <Meta label="Last modified" value={<span title={dateTime(p.updatedAt)}>{timeAgo(p.updatedAt)}</span>} />
                    <div className="col-span-2 sm:col-span-3">
                      <dt className="text-faint">Local directory</dt>
                      <dd className="mt-0.5 truncate font-mono text-[11px] text-muted" title={p.dir}>{p.dir}</dd>
                    </div>
                  </dl>
                  {p.exists === false && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-bad"><AlertTriangle className="h-3.5 w-3.5" /> The folder no longer exists on disk.</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line/60 pt-4">
                    <Button size="sm" disabled={isDemo} icon={<Code2 className="h-3.5 w-3.5" />} onClick={guard(() => act((c) => c.openVSCode(p.id), 'Opening in VS Code'))}>VS Code</Button>
                    <Button size="sm" disabled={isDemo} icon={<SquareTerminal className="h-3.5 w-3.5" />} onClick={() => nav(`/terminal?project=${p.id}`)}>Terminal</Button>
                    {live ? (
                      <Button size="sm" variant="subtle" icon={<ExternalLink className="h-3.5 w-3.5" />} disabled={!server.url} onClick={() => server.url && window.open(server.url, '_blank', 'noopener')}>Open preview</Button>
                    ) : (
                      <Button size="sm" disabled={isDemo} icon={<Play className="h-3.5 w-3.5" />} onClick={guard(async () => (await act((c) => c.startServer(p.id), 'Starting dev server')) && nav(`/preview?project=${p.id}`))}>Run</Button>
                    )}
                    <Button size="sm" disabled={isDemo} variant="subtle" icon={<Bot className="h-3.5 w-3.5" />} onClick={() => setCoding(p)}>Continue with Claude</Button>
                    <div className="ml-auto flex gap-1.5">
                      <Button size="sm" variant="ghost" disabled={isDemo} aria-label="Files" title="Browse files" onClick={() => setTree(p)}><FolderTree className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" disabled={isDemo} aria-label="Delete" title="Delete project" onClick={() => setDeleting(p)} className="hover:text-bad"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </NeedsAgent>

      <DeleteModal project={deleting} onClose={() => setDeleting(null)} />
      <ContinueModal project={coding} onClose={() => setCoding(null)} />
      <TreeModal project={tree} onClose={() => setTree(null)} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd className="mt-0.5 font-medium text-fg">{value}</dd>
    </div>
  );
}

function DeleteModal({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const { act } = useAgent();
  const [confirm, setConfirm] = useState('');
  const [files, setFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setConfirm('');
    setFiles(false);
  }, [project]);
  if (!project) return null;
  const ok = confirm === project.name;
  return (
    <Modal
      open
      onClose={onClose}
      title="Delete project"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!ok} loading={busy} icon={<Trash2 className="h-4 w-4" />} onClick={async () => {
            setBusy(true);
            const r = await act((c) => c.deleteProject(project.id, confirm, files), files ? 'Project and files deleted' : 'Project removed from DevBridge');
            setBusy(false);
            if (r) onClose();
          }}>
            {files ? 'Delete project and files' : 'Remove from DevBridge'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-muted">This stops its dev server and removes <span className="font-medium text-fg">{project.name}</span> from DevBridge.</p>
        <label className={cx('flex items-start gap-3 rounded-lg border p-3 transition', files ? 'border-bad/50 bg-bad/5' : 'border-line')}>
          <input type="checkbox" checked={files} onChange={(e) => setFiles(e.target.checked)} className="mt-0.5 accent-[rgb(var(--bad))]" />
          <span>
            <span className="font-medium">Also permanently delete the folder from disk</span>
            <span className="mt-0.5 block break-all font-mono text-xs text-muted">{project.dir}</span>
            <span className="mt-1 block text-xs text-bad">This cannot be undone.</span>
          </span>
        </label>
        <Field label={`Type "${project.name}" to confirm`}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

function ContinueModal({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const { act, jobs, jobLogs } = useAgent();
  const [prompt, setPrompt] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPrompt('');
    setJobId(null);
  }, [project]);
  if (!project) return null;
  const job = jobId ? jobs[jobId] : undefined;
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={<span className="flex items-center gap-2">Continue coding · {project.name} {job && <JobBadge status={job.status} />}</span>}
      footer={
        job ? (
          <>
            {job.status === 'running' && <Button variant="danger" onClick={() => act((c) => c.cancelJob(job.id))}>Cancel</Button>}
            <Button onClick={onClose}>Close</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={prompt.trim().length < 3} icon={<Bot className="h-4 w-4" />} onClick={async () => {
              setBusy(true);
              const j = await act((c) => c.continueClaude(project.id, prompt.trim()));
              setBusy(false);
              if (j) setJobId(j.id);
            }}>Send to Claude Code</Button>
          </>
        )
      }
    >
      {job ? (
        <JobStream job={job} log={jobLogs[job.id] ?? []} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {project.claudeSessionId ? 'Resumes the previous Claude Code session for this project, so it keeps its context.' : 'Starts a new Claude Code session in this project folder.'}
          </p>
          <Textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Add a monthly budget chart to the dashboard and write tests for the transaction form." autoFocus />
          <p className="text-xs text-faint">Claude can only read and edit files inside <span className="font-mono">{project.dir}</span>.</p>
        </div>
      )}
    </Modal>
  );
}

function TreeModal({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const { act } = useAgent();
  const [data, setData] = useState<{ entries: TreeEntry[]; truncated: boolean } | null>(null);
  useEffect(() => {
    setData(null);
    if (project) act((c) => c.tree(project.id)).then((d) => d && setData(d));
  }, [project, act]);
  if (!project) return null;
  return (
    <Modal open onClose={onClose} title={`Files · ${project.name}`}>
      {!data ? <p className="text-sm text-muted">Loading…</p> : data.entries.length === 0 ? <p className="text-sm text-muted">The folder is empty.</p> : (
        <div className="font-mono text-xs">
          <Tree entries={data.entries} depth={0} />
          {data.truncated && <p className="mt-2 text-faint">List truncated.</p>}
        </div>
      )}
    </Modal>
  );
}

function Tree({ entries, depth }: { entries: TreeEntry[]; depth: number }) {
  return (
    <ul>
      {entries.map((e) => (
        <li key={e.name}>
          <div className="flex items-center gap-1.5 py-0.5" style={{ paddingLeft: depth * 14 }}>
            {e.type === 'dir' ? <Folder className="h-3.5 w-3.5 text-accent" /> : <FileText className="h-3.5 w-3.5 text-faint" />}
            <span className={e.skipped ? 'text-faint' : ''}>{e.name}</span>
            {e.skipped && <span className="text-faint">(not expanded)</span>}
          </div>
          {e.children && e.children.length > 0 && <Tree entries={e.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { act, client } = useAgent();
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  useEffect(() => {
    if (open && client) client.folders().then((f) => setFolders(f.folders)).catch(() => setFolders([]));
  }, [open, client]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import an existing folder"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!folder || !name.trim()} onClick={async () => {
            if (await act((c) => c.importProject(name.trim(), folder), 'Project imported')) onClose();
          }}>Import</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">Only folders inside the agent's workspace can be imported.</p>
        <Field label="Folder">
          <Select value={folder} onChange={(e) => { setFolder(e.target.value); if (!name) setName(e.target.value); }}>
            <option value="">Choose a folder…</option>
            {folders.map((f) => <option key={f}>{f}</option>)}
          </Select>
        </Field>
        <Field label="Display name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
