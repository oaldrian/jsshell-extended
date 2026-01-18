# Writing Programs in this Shell

You can create small JavaScript programs that run inside this shell.
They are just `.js` files stored in the virtual filesystem.

## Simple scripts

1. Change into a folder for scripts, for example `/bin`:
   - `cd /bin`
2. Create or edit a script file:
   - `edit hello.js`
3. In the editor, type something like:

   ```js
   // `shell` and `argv` are provided when this script runs
   shell.print("Hello from a script!");
   shell.print("Arguments: " + argv.join(" "));
   ```

4. Save with Ctrl+S, then quit with Ctrl+Q.
5. Run the script from the shell:
   - `./hello.js one two three`

When you run a script with `./name.js`, the shell:
- Reads the file from the current directory in the virtual filesystem.
- Executes its contents as JavaScript, passing:
  - `shell` — the shell you are using right now.
  - `argv` — an array of arguments after the script name.

## Program convention: `main(shell, command, args)`

If your script defines a function `main(shell, command, args)`, the shell will call it (and await it if it returns a Promise).
This makes it easy to write interactive programs that can prompt for input:

```js
async function main(shell, command, args) {
  const name = args[0] || await shell.input("Name: ");
  shell.print(`Hello ${name}!`);
}
```

See `/bin/sample.js` for a working example.

## Command scripts: `.jsh` files

In addition to JavaScript programs, this shell supports simple **command scripts** with the `.jsh` extension.
A `.jsh` file contains **one shell command per line**.

### Usage

- Run a script explicitly from the current directory:
   - `./demo.jsh`

### Example

```text
# Comments are allowed (also //)
pwd
ls -la
mkdir "My Folder"
cd "My Folder"
touch notes.txt
edit notes.txt
```

### Behavior

- Lines starting with `#` or `//` are treated as comments.
- Empty lines are ignored.
- The script **stops on the first error** and prints where it stopped.
- Inside `.jsh`, commands are dispatched **strictly**:
   - no alias expansion
   - no PATH fallback
- If you need spaces in a filename, quote it (e.g. `"My Folder"`).

## Where to keep scripts

- You can store scripts anywhere, but `/bin` is a good default.
- If `/bin` is on PATH, you can run scripts by name (example: `sample` runs `/bin/sample.js`).

## Ideas

- Write helpers that print ASCII art or dashboards.
- Automate sequences of commands (for example, bootstrapping a project tree in your VFS).
- Combine scripts with files under `/home/user` and `/home/user/docs` to build your own mini environment.
