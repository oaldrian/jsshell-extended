# JsShell Details

This is the “long form” guide for the browser shell.
If you’re new here, start with `/home/user/docs/overview.md`.

## Mental model

- You are interacting with a shell UI in the browser.
- Your files live in a Virtual File System (VFS) that persists in browser localStorage.
- Programs are either built into the emulator (base programs like ls, cd, etc.) or stored as scripts in the VFS (commonly under `/bin`).

## Folder layout

After running `init`, you typically have:

- `/home/user` — your home directory
- `/home/user/docs` — documentation shipped with the demo
- `/bin` — executable scripts (often installed via assets)
- `/tmp` — scratch space
- `/sys` — system data and licenses

Tip: from `/home/user`, the docs folder is just `docs/`.

## Running programs

### Run a script file directly

If you have a file in the current directory:

- `./hello.js one two three`

This loads the file from the VFS and executes it.

### Run by name (PATH)

If `/bin` is on PATH, you can run `/bin/<name>.js` by typing just the name:

- `sample` runs `/bin/sample.js`
- `tetris` runs `/bin/tetris.js`

If a command isn’t found, check that the script exists and is executable via the shell’s rules:

- `ls /bin`
- `cat /bin/<name>.js`

## Editing files

Use the built-in editor:

- `edit notes.txt`
- `edit /home/user/notes.txt`

The editor is fullscreen: edit in-place, save with Ctrl+S, and quit with Ctrl+Q.

## Images and gallery

The gallery program displays PNG images stored in the VFS.

Examples:

- View a single image:
  - `gallery /home/user/pictures/some.png`
- Slideshow a folder (delay is in seconds):
  - `gallery /home/user/pictures 2`

## Games

Games are shipped as VFS programs under `/bin`.
What’s available depends on the current build, but commonly includes:

- `snake`
- `2048`
- `minesweeper`
- `conways`
- `tetris`
- `breakout`
- `roguelike`
- `spaceinvaders`

Run them like any other command:

- `snake`
- `spaceinvaders`

## Backups, restore, and reset

### init

- `init` sets up the base folder structure and installs the bundled assets.
- `init -f` forces a re-initialize.

### backup / restore

- `backup` exports a JSON snapshot (intended for later restore).
- `restore` imports a snapshot.
- `restore -f` overwrites conflicting localStorage keys and creates a safety snapshot first.

Because this is all browser-local, backups are mainly about moving your state between sessions/browsers or recovering from mistakes.

## Writing your own programs

See:

- `/home/user/docs/writing-programs.md`

A script can optionally define:

- `async function main(shell, command, args) { ... }`

If present, the shell calls it. This is the easiest way to build interactive scripts.

## Troubleshooting

- “Command not found”
  - Check the file exists: `ls /bin`
  - If it’s a script, run it explicitly: `./name.js`
- “My files disappeared”
  - You may have run `init -f` or cleared browser storage.
  - If you exported a backup earlier, use `restore`.
