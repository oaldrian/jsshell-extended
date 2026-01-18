# find

List files and folders under a path.

## Usage

- `find`
- `find <path>`
- `find <path> -ls`

## Options

- `-ls`  Print an `ls -l` style line for each match.
- `-name <glob>`  Filter by basename using simple glob patterns (`*` and `?`).
- `-type f|d`  Filter by file (`f`) or directory (`d`).
- `-maxdepth N`  Limit recursion depth (0 = only the start path).

## Examples

- `find /home/user`
- `find /home/user -ls`
- `find /etc -name "*.md"`
- `find /home/user -type f -name "*.js" -ls`

## See also

- `ls`, `grep`
