/*! download.js | Download a VFS file to the user's machine */

import { vfs } from '../fs/virtualFileSystem.js';

export const downloadCommands = ['download'];

function basename(path) {
  const p = String(path || '');
  const parts = p.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function guessMimeType(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.js')) return 'application/javascript';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'text/plain';
}

function triggerDownload(textContent, filename) {
  const blob = new Blob([textContent], { type: guessMimeType(filename) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseArgs(args) {
  const out = { path: null, name: null };
  const rest = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if ((a === '-n' || a === '--name') && args[i + 1]) {
      out.name = args[i + 1];
      i += 1;
      continue;
    }
    rest.push(a);
  }

  out.path = rest[0] || null;
  return out;
}

/**
 * download <vfsPath> [-n|--name filename]
 */
export async function executeDownloadProgram(shell, command, args) {
  if ((command || '').toLowerCase() !== 'download') {
    return { handled: false, shouldContinue: true };
  }

  if (typeof document === 'undefined') {
    shell.print('download: unavailable (no document).');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  const parsed = parseArgs(args);
  if (!parsed.path) {
    shell.print('download: missing file operand');
    shell.print('Usage: download <path> [-n|--name filename]');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  let content;
  try {
    content = vfs.readFile(parsed.path);
  } catch (err) {
    shell.print(String(err.message || err));
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  const defaultName = basename(parsed.path) || 'download.txt';
  const filename = parsed.name || defaultName;

  try {
    triggerDownload(content, filename);
    shell.print(`download: started download: ${filename}`);
  } catch (err) {
    shell.print(`download: failed to trigger download: ${String(err.message || err)}`);
  }

  shell.print('');
  return { handled: true, shouldContinue: true };
}
