# JsShell Overview

JsShell is a small shell-like environment that runs entirely in your browser.
It includes a virtual filesystem (VFS), history, tab completion, and a set of programs—many of which live in `/bin`.

## Quick start

- `init` sets up folders and installs the bundled files.
- `cd /home/user` then `ls`.
- `cd /bin` then run a program:
  - `sample`
  - `snake` / `tetris` / `spaceinvaders`
  - `edit /home/user/notes.txt`
  - `gallery /home/user/pictures 2`

## Common commands

- Files: `ls`, `cd`, `pwd`, `cat`, `touch`, `rm`, `mkdir`, `rmdir`
- Run scripts:
  - `./script.js args...` (run a file from the current directory)
  - `sample` (run a command from PATH, usually `/bin/<name>.js`)

## Keyboard shortcuts

- `Tab` — complete commands and paths
- `ArrowUp` / `ArrowDown` — history
- `Ctrl+R` — history search
- `Ctrl+H` — quick help panel
- `Ctrl+L` — clear screen
- `Ctrl+D` on an empty line — exit this session

## Files and persistence

- Your VFS is stored in your browser (localStorage), so files persist between reloads.
- `init -f` re-initializes the environment (and attempts a safety backup first).
- `backup` / `restore` save and restore browser state.

## Docs (all available)

These files are installed into your home directory by `init`:

- Overview: `cat /home/user/docs/overview.md`
- Detailed guide: `cat /home/user/docs/details.md`
- Writing programs: `cat /home/user/docs/writing-programs.md`
- Init notes: `cat /home/user/init-info.txt`
- Home readme: `cat /home/user/readme.txt`
