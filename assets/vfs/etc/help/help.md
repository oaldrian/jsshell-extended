# Help

This shell runs entirely in your browser and stores your files in a Virtual File System (VFS).

## Usage

- `help` — show this page
- `help <topic>` — show help for a command or program

Examples:

- `help ls`
- `help edit`
- `help viewmd`

## Tips

- Tab completion works for commands and paths.
- Many programs live in `/bin` (run by name because `/bin` is on PATH).
- Docs live in `/home/user/docs`:
  - `viewmd /home/user/docs/overview.md`
  - `viewmd /home/user/docs/details.md`

## Topics

Run `help <topic>` for any command shown by `help <unknown>`.

## Where this lives

Help pages are regular Markdown files in the VFS at `/etc/help/<topic>.md`.
They are installed by `init` from the bundled assets.