# download

Download a VFS file to your machine.

## Usage

- `download <vfsPath> [-n|--name filename]`

## Examples

- `download /home/user/docs/overview.md`
- `download /home/user/readme.txt -n readme.txt`

## Troubleshooting

- **Download blocked / no save dialog**: your browser may be blocking downloads for this page—allow downloads and try again.
- **“cannot read” / file not found**: verify the path with `ls` and `pwd`.
- **Wrong filename**: use `-n` / `--name` to set the downloaded filename.

## See also

- `upload`