# backup

Create a downloadable snapshot of browser localStorage.

## Usage

- `backup` (all keys)
- `backup <storageKey>` (single key)

## Notes

- This is a browser snapshot feature, not a VFS-only export.

## Examples

- `backup`

## Troubleshooting

- **Downloaded file is empty or missing keys**: some browsers restrict storage access in private mode; try a normal window.
- **You only want the VFS**: use the specific storage key shown by `init` backups (advanced usage).

## See also

- `restore`, `init`