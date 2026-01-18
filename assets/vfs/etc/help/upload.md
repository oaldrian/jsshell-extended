# upload

Upload a local file into the VFS.

## Usage

- `upload [targetFolder]`

## Notes

- This demo restricts allowed file types.

## Examples

- `upload` (upload into the current folder)
- `upload /home/user/pictures`

## Troubleshooting

- **File type rejected**: try a different file type (this demo intentionally restricts uploads).
- **Upload goes to the wrong place**: pass a target folder explicitly (e.g. `upload /tmp`).
- **Nothing appears after upload**: run `ls` in the target folder.

## See also

- `download`, `gallery`