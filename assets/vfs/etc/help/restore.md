# restore

Restore browser localStorage from a backup file.

## Usage

- `restore`
- `restore -f` / `restore --force`

## Notes

- Without `-f`, it refuses to overwrite existing keys.

## Examples

- `restore`
- `restore -f`

## Troubleshooting

- **Nothing happens / you can’t pick a file**: check that your browser allows file picker prompts for this page.
- **It refuses to overwrite keys**: use `restore -f` if you really want to replace existing localStorage data.
- **After restore the shell looks broken**: reload the page; then run `init` if you want the bundled VFS content installed.

## See also

- `backup`