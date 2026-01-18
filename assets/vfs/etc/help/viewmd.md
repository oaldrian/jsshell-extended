# viewmd

Render a Markdown file with highlighting (read-only).

## Usage

- `viewmd <path>`

Examples:

- `viewmd /home/user/docs/overview.md`
- `viewmd /home/user/docs/details.md`

## Notes

- Read-only: it never modifies the file.
- Runs as a fullscreen viewer.
- Press `Esc` (or `q`) to close.

## Troubleshooting

- **Output looks like raw Markdown**: make sure you ran `viewmd` (not `cat`).
- **File not found**: confirm the path with `ls`.

## See also

- `cat`, `edit`, `help`