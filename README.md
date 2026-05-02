Copy files from this directory to your project directory as needed.

## AGENTS.md

Combine the `AGENTS*.md` files as you need them. As few or as many as you want.

`cat AGENTS.md AGENTS-svelte.md AGENTS-lovely-docs.md > /path/to/new/project/AGENTS.md`

## Sandbox with bwrap (Linux only)

`scripts/run-pi-sandboxed.sh` provides a simple bubblewrap (https://github.com/containers/bubblewrap)

It mounts / read-only, keeps ~/.pi writable, and runs pi inside the sandbox. Very easy, reasonably secure.
Escape is not impossible, but it protects against lots of oopsies.

Copy it somewhere in your $PATH: `cp scripts/run-pi-sandboxed.sh ~/.local/bin/`

```
Usage: scripts/run-pi-sandboxed.sh [--no-ssh] [--runtime-dir] [--writable PATH ...] [PI_ARG ...]
       scripts/run-pi-sandboxed.sh [--no-ssh] [--runtime-dir] [--writable PATH ...] [-- COMMAND [ARG ...]]

Runs `pi` in bubblewrap by default.
Use `-- COMMAND ...` to run something other than `pi`.

Bubblewrap setup:
- host / mounted read-only
- current repo mounted read-write
- private /tmp
- network allowed by default
- ~/.pi mounted read-write by default
- XDG runtime dir hidden by default

Options:
  --no-ssh           hide ~/.ssh with an empty tmpfs
  --runtime-dir      mount XDG_RUNTIME_DIR read-only if present
  --writable PATH    extra host path to mount read-write
  --help             show this help

Examples:
  scripts/run-pi-sandboxed.sh
  scripts/run-pi-sandboxed.sh --no-ssh
  scripts/run-pi-sandboxed.sh --model gpt-5
  scripts/run-pi-sandboxed.sh "prompt here"
  scripts/run-pi-sandboxed.sh --runtime-dir -- pi
```
