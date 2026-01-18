/*! restore.js | Restore browser localStorage from a backup file */

import { STORAGE_KEYS } from '../constants.js';

export const restoreCommands = ['restore'];

const LS_BACKUP_PREFIX = STORAGE_KEYS.LOCALSTORAGE_BACKUP_PREFIX;

function backupExistingLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { backedUp: false, backupKey: null };
  }

  const storage = window.localStorage;
  const snapshot = { createdAt: new Date().toISOString(), keys: {} };

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key != null) {
      snapshot.keys[key] = storage.getItem(key);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupKey = `${LS_BACKUP_PREFIX}.${timestamp}`;

  try {
    storage.setItem(backupKey, JSON.stringify(snapshot));
    return { backedUp: true, backupKey };
  } catch (e) {
    return { backedUp: false, backupKey: null };
  }
}

function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.json,application/json';
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

/**
 * restore [-f]
 *
 * - Prompts the user to pick a backup file (JSON produced by `backup`).
 * - Without -f: refuses to overwrite existing keys that are also present in the backup.
 * - With -f: backs up current localStorage under a special key, then applies all keys from the backup.
 */
export async function executeRestoreProgram(shell, command, args) {
  if (command !== 'restore') {
    return { handled: false, shouldContinue: true };
  }

  if (typeof window === 'undefined' || !window.localStorage) {
    shell.print('restore: window.localStorage is not available in this environment.');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  const force = args.includes('-f') || args.includes('--force');

  shell.print('restore: choose a backup file created by the `backup` command.');
  const file = await pickFile();

  if (!file) {
    shell.print('restore: no file selected.');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  let text;
  try {
    text = await readFileAsText(file);
  } catch (e) {
    shell.print('restore: failed to read selected file.');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    shell.print('restore: selected file is not valid JSON.');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  if (!data || typeof data !== 'object' || !data.keys || typeof data.keys !== 'object') {
    shell.print('restore: backup file does not have the expected structure (missing `keys`).');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  const storage = window.localStorage;
  const backupKeys = Object.keys(data.keys);

  // Check for conflicts
  const conflicting = backupKeys.filter((k) => storage.getItem(k) !== null);

  if (conflicting.length > 0 && !force) {
    shell.print('restore: existing localStorage entries would be overwritten:');
    shell.print('  ' + conflicting.join(', '));
    shell.print('Use `restore -f` to force overwrite (will create a safety backup first).');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  const backupInfo = backupExistingLocalStorage();

  if (!backupInfo.backedUp) {
    shell.print('restore: warning: failed to backup current localStorage before applying restore.');
  } else {
    shell.print(`restore: current localStorage snapshot saved under key "${backupInfo.backupKey}".`);
  }

  // Apply new values
  for (const key of backupKeys) {
    try {
      const value = data.keys[key];
      if (typeof value === 'string' || value === null) {
        // localStorage.setItem only accepts strings; treat null as clearing the key
        if (value === null) {
          storage.removeItem(key);
        } else {
          storage.setItem(key, value);
        }
      }
    } catch (e) {
      shell.print(`restore: failed to apply key "${key}": ${String(e)}`);
    }
  }

  shell.print('restore: applied backup to localStorage.');
  shell.print('You may need to reload the page for all changes to take full effect.');
  shell.print('');

  return { handled: true, shouldContinue: true };
}
