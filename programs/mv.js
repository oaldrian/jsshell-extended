/*! mv.js | `mv` command for JsShell virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';
import { normalizePathParts } from '../fs/pathUtils.js';

export const mvCommands = ['mv'];

function resolveFolderByParts(root, parts) {
  let current = root;
  for (const part of parts) {
    const next = current.folders.find((f) => f.name === part);
    if (!next) return null;
    current = next;
  }
  return current;
}

function joinAbsoluteFromParts(parts) {
  return '/' + parts.join('/');
}

function isSameLocation(aParts, bParts) {
  if (aParts.length !== bParts.length) return false;
  for (let i = 0; i < aParts.length; i += 1) {
    if (aParts[i] !== bParts[i]) return false;
  }
  return true;
}

function basenameFromParts(parts) {
  return parts.length ? parts[parts.length - 1] : '';
}

function tryResolveAsFolder(root, parts) {
  return resolveFolderByParts(root, parts);
}

function tryResolveAsFile(root, parts) {
  const name = parts[parts.length - 1];
  const parentParts = parts.slice(0, -1);
  const parent = resolveFolderByParts(root, parentParts);
  if (!parent) return { parent: null, file: null };
  const file = parent.files.find((f) => f.name === name) || null;
  return { parent, file };
}

function tryResolveAsFolderChild(root, parts) {
  const name = parts[parts.length - 1];
  const parentParts = parts.slice(0, -1);
  const parent = resolveFolderByParts(root, parentParts);
  if (!parent) return { parent: null, folder: null };
  const folder = parent.folders.find((f) => f.name === name) || null;
  return { parent, folder };
}

/**
 * Execute the `mv` command.
 * Supports moving/renaming files and folders.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 */
export function executeMvCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'mv') {
    return { handled: false, shouldContinue: true };
  }

  if (!Array.isArray(args) || args.length < 2) {
    shell.print('mv: missing operand');
    shell.print("Try 'mv source dest'");
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('mv: missing operand') };
  }

  const srcRaw = String(args[0]);
  const destRaw = String(args[1]);

  const cwdParts = Array.isArray(vfs.state?.cwdParts) ? vfs.state.cwdParts : [];
  const root = vfs.state?.root;
  if (!root) {
    shell.print('mv: internal error (no VFS root)');
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('mv: no VFS root') };
  }

  const srcParts = normalizePathParts(cwdParts, srcRaw);
  const destParts = normalizePathParts(cwdParts, destRaw);

  if (!srcParts.length) {
    shell.print('mv: refusing to move root');
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('mv: refusing to move root') };
  }

  // Identify source as file or folder
  const fileRes = tryResolveAsFile(root, srcParts);
  const folderRes = fileRes.file ? null : tryResolveAsFolderChild(root, srcParts);

  const srcKind = fileRes.file ? 'file' : (folderRes && folderRes.folder ? 'folder' : null);
  if (!srcKind) {
    shell.print(`mv: cannot stat '${srcRaw}': No such file or directory`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('mv: source not found') };
  }

  // Determine destination: if dest is an existing folder, move into it using same base name.
  let destParentParts = destParts.slice(0, -1);
  let destName = basenameFromParts(destParts);
  const destFolder = tryResolveAsFolder(root, destParts);
  if (destFolder) {
    destParentParts = destParts;
    destName = basenameFromParts(srcParts);
  }

  if (!destName) {
    shell.print(`mv: invalid destination: ${destRaw}`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('mv: invalid destination') };
  }

  const destParent = resolveFolderByParts(root, destParentParts);
  if (!destParent) {
    shell.print(`mv: cannot move to '${joinAbsoluteFromParts(destParentParts)}': No such directory`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('mv: destination directory not found') };
  }

  // No-op check
  const finalDestParts = destParentParts.concat([destName]);
  if (isSameLocation(srcParts, finalDestParts)) {
    return { handled: true, shouldContinue: true, ok: true };
  }

  // Collision check
  if (destParent.files.some((f) => f.name === destName) || destParent.folders.some((f) => f.name === destName)) {
    shell.print(`mv: cannot move to '${destRaw}': destination exists`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('mv: destination exists') };
  }

  try {
    if (srcKind === 'file') {
      // Remove from old parent
      const srcIdx = fileRes.parent.files.findIndex((f) => f === fileRes.file);
      if (srcIdx >= 0) fileRes.parent.files.splice(srcIdx, 1);

      // Insert into new parent
      fileRes.file.name = destName;
      destParent.files.push(fileRes.file);
      vfs.save();
      return { handled: true, shouldContinue: true, ok: true };
    }

    // folder
    const srcIdx = folderRes.parent.folders.findIndex((f) => f === folderRes.folder);
    if (srcIdx >= 0) folderRes.parent.folders.splice(srcIdx, 1);

    folderRes.folder.name = destName;
    destParent.folders.push(folderRes.folder);

    // If cwd is inside moved folder, keep cwd consistent by relocating it.
    // (Best-effort; if it fails, leave cwd as-is.)
    try {
      const srcAbs = joinAbsoluteFromParts(srcParts);
      const destAbs = joinAbsoluteFromParts(finalDestParts);
      const cwdAbs = vfs.getCwdPath();
      if (cwdAbs === srcAbs || cwdAbs.startsWith(srcAbs + '/')) {
        const suffix = cwdAbs.slice(srcAbs.length);
        const nextCwd = destAbs + suffix;
        vfs.changeDirectory(nextCwd);
      }
    } catch (_) {
      // ignore
    }

    vfs.save();
    return { handled: true, shouldContinue: true, ok: true };
  } catch (err) {
    shell.print(`mv: failed: ${err.message || err}`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('mv: failed') };
  }
}
