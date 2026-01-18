# gallery

Fullscreen image viewer / slideshow (PNG files).

## Usage

- `gallery <file-or-folder> [delaySeconds]`

## Notes

- Installed as `/bin/gallery.js`.
- Paths with spaces must be quoted (like a real shell).

## Examples

- `gallery /home/user/test.png`
- `gallery /home/user/test.png 2`
- `gallery /home/user 2`

## Troubleshooting

- **No images show up**: ensure you have `.png` files in the folder (use `ls`).
- **Files are not PNG**: convert them or upload PNGs (this viewer is PNG-focused).

## See also

- `upload`, `ls`