// Small JSON-file store for projects, stats, activity and command history,
// plus an in-process event bus that the WebSocket layer forwards to clients.
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

/** Broadcast an event to every connected UI. */
export function emit(type, data) {
  bus.emit('event', { type, data, at: new Date().toISOString() });
}

const EMPTY = () => ({
  projects: [],
  stats: { filesCreated: 0, filesModified: 0, sessionsStarted: 0 },
  activity: [],
  history: [],
});

export class Store {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'state.json');
    this.data = EMPTY();
    if (fs.existsSync(this.file)) {
      try {
        this.data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
      } catch {
        fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`);
      }
    }
    this.timer = null;
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this.timer);
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // ---- projects
  listProjects() {
    return this.data.projects;
  }
  getProject(id) {
    return this.data.projects.find((p) => p.id === id);
  }
  addProject(p) {
    this.data.projects.unshift(p);
    this.save();
    emit('project.updated', p);
    return p;
  }
  updateProject(id, patch) {
    const p = this.getProject(id);
    if (!p) return null;
    Object.assign(p, patch, { updatedAt: new Date().toISOString() });
    this.save();
    emit('project.updated', p);
    return p;
  }
  removeProject(id) {
    this.data.projects = this.data.projects.filter((p) => p.id !== id);
    this.save();
    emit('project.removed', { id });
  }

  // ---- stats & activity
  bump(key, n = 1) {
    this.data.stats[key] = (this.data.stats[key] || 0) + n;
    this.save();
  }
  log(kind, message, projectId = null) {
    const entry = { id: cryptoId(), kind, message, projectId, at: new Date().toISOString() };
    this.data.activity.unshift(entry);
    this.data.activity.length = Math.min(this.data.activity.length, 200);
    this.save();
    emit('activity', entry);
    return entry;
  }

  // ---- command history
  addHistory(entry) {
    this.data.history.unshift(entry);
    this.data.history.length = Math.min(this.data.history.length, 200);
    this.save();
  }
}

export function cryptoId() {
  return globalThis.crypto.randomUUID();
}

/** Keep the last `max` lines of streamed output. */
export class RingLog {
  constructor(max = 2000) {
    this.max = max;
    this.lines = [];
  }
  push(line) {
    this.lines.push(line);
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
  }
}
