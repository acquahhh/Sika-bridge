// Workspace path restriction. Every filesystem path the agent touches on
// behalf of the browser goes through resolveInside().
import fs from 'node:fs';
import path from 'node:path';

export class PathError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'path_rejected';
  }
}

/** Characters we refuse in any path or argument that may reach cmd.exe. */
export const SHELL_META = /["%^&|<>!\r\n`$]/;

const SAFE_SEGMENT = /^[A-Za-z0-9._\- ]+$/;

/** Turn a project name into a safe folder name. */
export function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Resolve `rel` (a path relative to `root`) and make sure the result stays
 * inside `root`, including after following symlinks of existing parents.
 */
export function resolveInside(root, rel = '') {
  if (typeof rel !== 'string') throw new PathError('Path must be a string');
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new PathError('Use a path relative to the workspace');
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  for (const p of parts) {
    if (p === '..' || p === '.' || !SAFE_SEGMENT.test(p)) {
      throw new PathError(`Folder name "${p}" is not allowed. Use letters, digits, spaces, dots, dashes and underscores.`);
    }
  }
  const rootReal = fs.realpathSync(root);
  const target = path.resolve(rootReal, ...parts);
  if (!isWithin(rootReal, target)) throw new PathError('Path escapes the workspace');

  // Follow symlinks on the deepest existing ancestor.
  let probe = target;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const real = fs.realpathSync(probe);
  if (!isWithin(rootReal, real)) throw new PathError('Path escapes the workspace through a link');
  return target;
}

export function isWithin(root, target) {
  const r = path.relative(root, target);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv', '.cache']);

/** Directory tree for the UI, bounded in depth and size. */
export function readTree(dir, { maxDepth = 4, maxEntries = 400 } = {}) {
  let count = 0;
  const walk = (d, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return [];
    }
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    const out = [];
    for (const e of entries) {
      if (count >= maxEntries) break;
      if (e.isSymbolicLink()) continue;
      count++;
      if (e.isDirectory()) {
        const skipped = IGNORE.has(e.name);
        out.push({
          name: e.name,
          type: 'dir',
          skipped,
          children: skipped || depth >= maxDepth ? [] : walk(path.join(d, e.name), depth + 1),
        });
      } else {
        out.push({ name: e.name, type: 'file' });
      }
    }
    return out;
  };
  return { entries: walk(dir, 1), truncated: count >= maxEntries };
}
