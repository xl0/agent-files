# Why

First, this repo is for my own reference. You are welcome to ride along.

For each new project, I copy stuff from here to the project.
I don't use global skills/AGENTS.md/etc, everything is per-project.

## AGENTS.md

Combine the `AGENTS*.md` files as you need them. As few or as many as you want.

`cat AGENTS.md AGENTS-svelte.md AGENTS-lovely-docs.md > /path/to/new/project/AGENTS.md`

Then edit the new `AGENTS.md`, and optionally feed the edits back here if they are good.

# Pi

## Packages to install:

# Show rendered system prompt & tool schemas (good for developing modules with new tools)
```bash
pi install -l https://github.com/xl0/pi-agent-show-sysprompt
```

## Sandbox with bwrap (Linux only)

`scripts/run-pi-sandboxed.sh` provides a simple bubblewrap (https://github.com/containers/bubblewrap)

It mounts / read-only, keeps ~/.pi, ~/.bun, and ~/.cache writable by default, and runs pi inside the sandbox. Very easy, reasonably secure.
Escape is not impossible, but it protects against lots of oopsies.

Copy it somewhere in your $PATH: `cp scripts/run-pi-sandboxed.sh ~/.local/bin/`

```
Usage: scripts/run-pi-sandboxed.sh [--no-ssh] [--no-runtime] [--ro-bun] [--ro-cache] [--ro-node-modules] [--writable PATH ...] [PI_ARG ...]
       scripts/run-pi-sandboxed.sh [--no-ssh] [--no-runtime] [--ro-bun] [--ro-cache] [--ro-node-modules] [--writable PATH ...] [-- COMMAND [ARG ...]]

Runs `pi` in bubblewrap by default.
Use `-- COMMAND ...` to run something other than `pi`.

Bubblewrap setup:
- host / mounted read-only
- current repo mounted read-write
- private /tmp
- network allowed by default
- ~/.pi mounted read-write by default
- ~/.bun mounted read-write by default
- ~/.cache mounted read-write by default
- ~/node_modules mounted read-write by default if present
- XDG runtime dir mounted read-only by default

Options:
  --no-ssh           hide ~/.ssh with an empty tmpfs
  --no-runtime       hide XDG_RUNTIME_DIR with an empty tmpfs
                     default: mount XDG_RUNTIME_DIR read-only if present
  --ro-bun           keep ~/.bun read-only; default: mount ~/.bun read-write if HOME exists
  --ro-cache         keep ~/.cache read-only; default: mount ~/.cache read-write if HOME exists
  --ro-node-modules  keep ~/node_modules read-only; default: mount read-write if present
  --writable PATH    extra host path to mount read-write
  --help             show this help

Examples:
  scripts/run-pi-sandboxed.sh
  scripts/run-pi-sandboxed.sh --no-ssh
  scripts/run-pi-sandboxed.sh --model gpt-5
  scripts/run-pi-sandboxed.sh "prompt here"
  scripts/run-pi-sandboxed.sh --no-runtime -- pi
  scripts/run-pi-sandboxed.sh --ro-bun
  scripts/run-pi-sandboxed.sh --ro-cache
  scripts/run-pi-sandboxed.sh --ro-node-modules
  scripts/run-pi-sandboxed.sh -- bash -lc 'uname -a'
```
