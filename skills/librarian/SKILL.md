---
name: librarian
description: "Cache and refresh remote git repositories under ~/.cache/checkouts/<host>/<org>/<repo>. Use this skill when you need to access files in a remote git repo."
---

Use this skill when the user points you to a remote git repository or when you feel the need to access one.

The goal is to keep a reusable local checkout that is:
- **stable** (predictable path)
- **up to date** (periodic fetch + fast-forward when safe)
- **efficient** (partial clone with `--filter=blob:none`, no repeated full clones)

## Cache location

Repositories are stored at `~/.cache/checkouts/<host>/<org>/<repo>`

## Command

```bash
python3 checkout.py mitsuhiko/minijinja  # -> outputs "/home/<user>/.cache/checkouts/github.com/mitsuhiko/minijinja"
python3 checkout.py github.com/mitsuhiko/minijinja
python3 checkout.py https://github.com/mitsuhiko/minijinja
```

This works for all major git providers.

The script will:
1. Parse the repo reference into host/org/repo.
2. Clone if missing.
3. Reuse existing checkout if present.
4. Fetch from `origin` when stale (default interval: 300s).
5. Attempt a fast-forward merge if the checkout is clean and has an upstream.

## Update strategy

- Default behavior is **throttled refresh** (every 5 minutes) to avoid unnecessary network calls.
- Force immediate refresh with:

```bash
python3 checkout.py <repo> --force-update
```

## Recommended workflow

1. Resolve repository path via `python3 checkout.py <repo>` - thiw will create a checkout if missing or update if stale.
2. Use that path for searching, reading, and analysis.

## If edits are needed

Do not edit directly in the shared cache. Create a separate worktree or copy from the cached checkout for task-specific modifications.