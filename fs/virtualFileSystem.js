/*! virtualFileSystem.js | Simple in-browser virtual filesystem persisted to localStorage */

import { STORAGE_KEYS } from '../constants.js';
import { normalizePathParts } from './pathUtils.js';

const STORAGE_KEY = STORAGE_KEYS.VFS;

/**
 * @typedef {Object} VfsFile
 * @property {'file'} type
 * @property {string} name
 * @property {string} content
 */

/**
 * @typedef {Object} VfsFolder
 * @property {'folder'} type
 * @property {string} name
 * @property {VfsFolder[]} folders
 * @property {VfsFile[]} files
 */

/**
 * @typedef {Object} VfsState
 * @property {VfsFolder} root
 * @property {string[]} cwdParts - current working directory as path parts relative to root
 */

/**
 * Virtual filesystem class wrapping a JSON structure with simple helpers.
 */
export class VirtualFileSystem {
  /** @param {Storage} [storage] */
  constructor(storage = window.localStorage) {
    this._storage = storage;
    this._state = this._load() || this._createDefaultState();
  }

  /** @returns {VfsState} */
  get state() {
    return this._state;
  }

  /** Persist current state to localStorage. */
  save() {
    this._storage.setItem(STORAGE_KEY, JSON.stringify(this._state));
  }

  /** Reset filesystem to default state. */
  reset() {
    this._state = this._createDefaultState();
    this.save();
  }

  /** @private */
  _createDefaultState() {
    return {
      root: {
        type: 'folder',
        name: '/',
        folders: [],
        files: []
      },
      cwdParts: []
    };
  }

  /** @private */
  _load() {
    try {
      const raw = this._storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.root || parsed.root.type !== 'folder') return null;
      parsed.cwdParts = Array.isArray(parsed.cwdParts) ? parsed.cwdParts : [];
      return parsed;
    } catch (_) {
      return null;
    }
  }

  /** Get current working directory folder node. */
  getCwdFolder() {
    return this._resolveFolder(this._state.cwdParts);
  }

  /** Get current working directory path as string. */
  getCwdPath() {
    return '/' + this._state.cwdParts.join('/');
  }

  /** Change current working directory using an absolute or relative path. */
  changeDirectory(path) {
    const parts = this._normalizePath(path);
    const folder = this._resolveFolder(parts);
    if (!folder) {
      throw new Error(`cd: no such file or directory: ${path}`);
    }
    this._state.cwdParts = parts;
    this.save();
  }

  /** Create a folder in the current working directory. */
  mkdir(name) {
    if (!name || /[\\/]/.test(name)) {
      throw new Error('mkdir: folder name must be a simple name without path separators');
    }
    const cwd = this.getCwdFolder();
    if (cwd.folders.some((f) => f.name === name) || cwd.files.some((f) => f.name === name)) {
      throw new Error(`mkdir: cannot create directory '${name}': File exists`);
    }
    cwd.folders.push({ type: 'folder', name, folders: [], files: [] });
    this.save();
  }

  /** List contents of a folder at path (or current dir by default). */
  list(path = '.') {
    const folder = path === '.' ? this.getCwdFolder() : this._resolveFolder(this._normalizePath(path));
    if (!folder) {
      throw new Error(`ls: cannot access '${path}': No such file or directory`);
    }
    return {
      folders: folder.folders.map((f) => f.name),
      files: folder.files.map((f) => f.name)
    };
  }

  /** Remove an empty folder in the current working directory. */
  rmdir(name) {
    const cwd = this.getCwdFolder();
    const idx = cwd.folders.findIndex((f) => f.name === name);
    if (idx === -1) {
      throw new Error(`rmdir: failed to remove '${name}': No such file or directory`);
    }
    const folder = cwd.folders[idx];
    if (folder.folders.length || folder.files.length) {
      throw new Error(`rmdir: failed to remove '${name}': Directory not empty`);
    }
    cwd.folders.splice(idx, 1);
    this.save();
  }

  /**
   * Create or overwrite a file at the given path (relative to cwd by default).
   * @param {string} path
   * @param {string} content
   */
  writeFile(path, content) {
    const { parent, name, existingFile } = this._ensureFileParent(path);
    if (existingFile) {
      existingFile.content = content;
    } else {
      parent.files.push({ type: 'file', name, content });
    }
    this.save();
  }

  /**
   * Read file content at the given path.
   * @param {string} path
   * @returns {string}
   */
  readFile(path) {
    const { file } = this._getFile(path);
    if (!file) {
      throw new Error(`cat: ${path}: No such file`);
    }
    return file.content;
  }

  /**
   * Delete a file at the given path.
   * @param {string} path
   */
  unlink(path) {
    const parts = this._normalizePath(path);
    const name = parts.pop();
    const parent = this._resolveFolder(parts);
    if (!parent) {
      throw new Error(`No such file: ${path}`);
    }
    const idx = parent.files.findIndex((f) => f.name === name);
    if (idx === -1) {
      throw new Error(`No such file: ${path}`);
    }
    parent.files.splice(idx, 1);
    this.save();
  }

  /** @private */
  _normalizePath(path) {
    return normalizePathParts(this._state.cwdParts, path);
  }

  /** @private */
  _resolveFolder(parts) {
    let current = this._state.root;
    for (const part of parts) {
      const next = current.folders.find((f) => f.name === part);
      if (!next) return null;
      current = next;
    }
    return current;
  }

  /** @private */
  _getFile(path) {
    const parts = this._normalizePath(path);
    const name = parts.pop();
    const parent = this._resolveFolder(parts);
    if (!parent) return { parent: null, file: null };
    const file = parent.files.find((f) => f.name === name);
    return { parent, file };
  }

  /** @private */
  _ensureFileParent(path) {
    const parts = this._normalizePath(path);
    const name = parts.pop();
    const parent = this._resolveFolder(parts);
    if (!parent) {
      throw new Error(`No such directory for path: ${path}`);
    }
    const existingFile = parent.files.find((f) => f.name === name) || null;
    return { parent, name, existingFile };
  }
}

// Shared singleton instance used by commands and holder
export const vfs = new VirtualFileSystem();
