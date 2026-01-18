# init

Initialize the base folder structure and install bundled assets.

## Usage

- `init`
- `init -f` / `init --force`
- `init --check`
- `init --update`

## Notes

- `init -f` attempts a safety backup of the previous VFS first.
- `init --check` and `init --update` do not reset your VFS; they only compare/sync bundled assets.
- During asset install, init prints the total number of assets first.
- Progress output is printed every 10 assets as a counter (`10/142`, `20/142`, ...) and a final `N/N`.
- The installed assets version is stored in `/sys/assets-version.json`.

## Examples

- `init`
- `init -f`
- `init --check`
- `init --update`

## Troubleshooting

- **“virtual filesystem already initialized”**: run `init -f` to re-initialize (a backup is attempted first).
- **Missing programs/help/docs after init**: the asset manifest may have failed to load (try reloading the page and running `init -f`).
- **Only `/sys` exists**: run `init` again; `/sys` alone is treated as “empty” and init should proceed.

## See also

- `backup`, `restore`