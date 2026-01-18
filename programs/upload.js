/*! upload.js | Upload a local file into the VFS */

import { vfs } from '../fs/virtualFileSystem.js';

export const uploadCommands = ['upload'];

const ALLOWED_EXTS = ['.js', '.txt', '.md'];

function getExt(name) {
  const n = String(name || '');
  const idx = n.lastIndexOf('.');
  return idx === -1 ? '' : n.slice(idx).toLowerCase();
}

function isAllowedFilename(name) {
  return ALLOWED_EXTS.includes(getExt(name));
}

function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ALLOWED_EXTS.join(',');
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      document.body.removeChild(input);
      resolve(file || null);
    });

    document.body.appendChild(input);
    input.click();
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

function resolveTargetPath(userArg, pickedName) {
  const arg = String(userArg || '').trim();
  if (!arg) {
    return pickedName;
  }

  // Treat trailing slash as folder.
  if (arg.endsWith('/')) {
    return arg + pickedName;
  }

  return arg;
}

/**
 * upload [targetPathOrFolder]
 *
 * - Prompts for a local file via file dialog.
 * - Only allows .js, .txt, .md
 * - If targetPathOrFolder ends with '/', saves into that folder using original filename.
 * - Otherwise treats it as the target file path.
 */
export async function executeUploadProgram(shell, command, args) {
  if ((command || '').toLowerCase() !== 'upload') {
    return { handled: false, shouldContinue: true };
  }

  if (typeof document === 'undefined') {
    shell.print('upload: unavailable (no document).');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  shell.print('upload: choose a local file (.js, .txt, .md)');
  const file = await pickFile();

  if (!file) {
    shell.print('upload: no file selected.');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  if (!isAllowedFilename(file.name)) {
    shell.print(`upload: rejected "${file.name}" (allowed: ${ALLOWED_EXTS.join(', ')})`);
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  let text;
  try {
    text = await readFileAsText(file);
  } catch (err) {
    shell.print('upload: failed to read selected file.');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  const target = resolveTargetPath(args[0], file.name);

  try {
    vfs.writeFile(target, text);
    shell.print(`upload: wrote ${target}`);
  } catch (err) {
    shell.print(String(err.message || err));
  }

  shell.print('');
  return { handled: true, shouldContinue: true };
}
