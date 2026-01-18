# grep

Search for text inside files.

## Usage

- `grep [-r] [-i] [-n] <pattern> [path ...]`

## Options

- `-r`  Search directories recursively.
- `-i`  Case-insensitive search.
- `-n`  Show line numbers.

## Pattern

- Plain text patterns do substring matching.
- You can also write a regex as `/.../` (example: `grep -r "/todo\s*:/" /home/user`).

## Examples

- `grep hello /home/user/readme.txt`
- `grep -n "init:" /etc/help/init.md`
- `grep -r -i "rogue" /home/user`

## See also

- `find`, `cat`, `viewmd`
