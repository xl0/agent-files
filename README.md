# Why

First, this repo is for my own reference. You are welcome to ride along.

For each new project, I copy stuff from here to the project.
I avoid global skills/AGENTS.md/etc, everything is per-project.

## AGENTS.md

Combine the `agents.md/AGENTS*.md` files as you need them. As few or as many as you want.

`cd agents.md && cat AGENTS.md AGENTS-svelte.md AGENTS-lovely-docs.md > /path/to/new/project/AGENTS.md`

Then edit the new `AGENTS.md`, and optionally feed the edits back here if they are good.

# Pi

## Packages to install:

- `pi install -l npm:@xl0/pi-lovely-dev-tools` — `/tool` and `/show-sysprompt` commands.
- `pi install -l ./pi/packages/pi-lovely-comment` — `/comment` GUI-editor draft workflow.
- `pi install -l npm:@xl0/pi-ide-integration` — IDE selection/@mention integration.
- `pi install -l npm:@xl0/pi-lovely-web` — `web_search`/`web_fetch`/`web_image`.
- `pi install -l git:git@github.com:xl0/pi-agent-notebook-extension` — `.ipynb` read/edit tools + VSCode/Jupyter execution.

## Sandbox with bwrap (Linux only)

`scripts/run-pi-sandboxed.sh` provides a simple bubblewrap (https://github.com/containers/bubblewrap)

It mounts / read-only, keeps ~/.pi, ~/.bun, ~/.cache, VS Code user-data dirs, ~/node_modules, and XDG_RUNTIME_DIR writable by default, mounts NVIDIA device nodes when present, and runs pi inside the sandbox. Very easy, reasonably secure.
Escape is not impossible, but it protects against lots of oopsies.

Copy it somewhere in your $PATH: `cp scripts/run-pi-sandboxed.sh ~/.local/bin/`

```
Usage: scripts/run-pi-sandboxed.sh [--no-ssh] [--no-runtime] [--ro-runtime] [--ro-bun] [--ro-cache] [--ro-vscode] [--ro-node-modules] [--no-cuda] [--writable PATH ...] [PI_ARG ...]
       scripts/run-pi-sandboxed.sh [--no-ssh] [--no-runtime] [--ro-runtime] [--ro-bun] [--ro-cache] [--ro-vscode] [--ro-node-modules] [--no-cuda] [--writable PATH ...] [-- COMMAND [ARG ...]]

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
- VS Code user-data dirs mounted read-write by default if present
- ~/node_modules mounted read-write by default if present
- XDG runtime dir mounted read-write by default
- NVIDIA device nodes mounted by default if present, so CUDA/nvidia-smi can work

Options:
  --no-ssh           hide ~/.ssh with an empty tmpfs
  --no-runtime       hide XDG_RUNTIME_DIR (/run/user/<uid>) with an empty tmpfs
                     default: mount XDG_RUNTIME_DIR read-write if present
  --ro-runtime       keep XDG_RUNTIME_DIR read-only
  --ro-bun           keep ~/.bun read-only; default: mount ~/.bun read-write if HOME exists
  --ro-cache         keep ~/.cache read-only; default: mount ~/.cache read-write if HOME exists
  --ro-vscode        keep VS Code user-data dirs read-only; default: mount existing dirs read-write
  --ro-node-modules  keep ~/node_modules read-only; default: mount read-write if present
  --no-cuda          do not mount NVIDIA device nodes into the sandbox
  --writable PATH    extra host path to mount read-write
  --help             show this help

Examples:
  scripts/run-pi-sandboxed.sh
  scripts/run-pi-sandboxed.sh --no-ssh
  scripts/run-pi-sandboxed.sh --model gpt-5
  scripts/run-pi-sandboxed.sh "prompt here"
  scripts/run-pi-sandboxed.sh --no-runtime -- pi
  scripts/run-pi-sandboxed.sh --ro-runtime
  scripts/run-pi-sandboxed.sh --ro-bun
  scripts/run-pi-sandboxed.sh --ro-cache
  scripts/run-pi-sandboxed.sh --ro-vscode
  scripts/run-pi-sandboxed.sh --ro-node-modules
  scripts/run-pi-sandboxed.sh --no-cuda
  scripts/run-pi-sandboxed.sh -- bash -lc 'uname -a'
```
