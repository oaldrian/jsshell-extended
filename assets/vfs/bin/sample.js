/*
  sample.js - Example JsShell program

  Run:
    cd /bin
    ./sample.js
    ./sample.js Alice

  This demonstrates the recommended convention:
    async function main(shell, command, args) { ... }
*/

async function main(shell, command, args) {
  // Use a CLI arg if provided, otherwise prompt interactively
  const name = (args && args[0]) ? args[0] : await shell.input("Name: ");
  shell.print(`Hello ${name}!`);
  shell.print("(Tip) Edit me: edit /bin/sample.js");
}
