# Codebase

Tiny utility repo.

## Files
- `AGENTS*.md`: reusable instruction fragments for other projects.
- `README.md`: explains how to copy/combine AGENTS files and use the sandbox script.
- `scripts/run-pi-sandboxed.sh`: bubblewrap wrapper. Mounts `/` read-only, current repo read-write, private temp dirs, optional network disable, optional XDG runtime exposure, extra writable bind mounts, and `~/.pi` writable by default. Defaults to running `pi` for any wrapper args, including plain prompt strings; `--` switches to an explicit command.
- `TODO.md`: short current plan/todo.

## Sandbox script behavior
- Requires `bwrap`.
- Usage/help text derives from the invoked executable name (`$0##*/`).
- `--help` prints usage and exits 0.
- Command is optional; defaults to `pi` when omitted. Any remaining args after wrapper option parsing are passed to `pi` by default, so both flags and plain prompt strings work without `-- pi`.
- Validates `--writable` args exist, resolves via `realpath`, then bind-mounts them read-write.
