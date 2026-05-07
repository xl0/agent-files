#!/usr/bin/env bash
set -euo pipefail

prog_name=${0##*/}

if ! command -v bwrap >/dev/null 2>&1; then
  echo "bwrap not found. Install bubblewrap." >&2
  exit 1
fi

print_help() {
  cat >&2 <<EOF
Usage: $prog_name [--no-ssh] [--no-runtime] [--ro-bun] [--ro-cache] [--ro-node-modules] [--writable PATH ...] [PI_ARG ...]
       $prog_name [--no-ssh] [--no-runtime] [--ro-bun] [--ro-cache] [--ro-node-modules] [--writable PATH ...] [-- COMMAND [ARG ...]]

Runs 'pi' in bubblewrap by default.
Use '-- COMMAND ...' to run something other than 'pi'.

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
  --no-runtime       hide XDG_RUNTIME_DIR (/run/user/<uid>) with an empty tmpfs
                     default: mount XDG_RUNTIME_DIR read-only if present
  --ro-bun           keep ~/.bun read-only; default: mount ~/.bun read-write if HOME exists
  --ro-cache         keep ~/.cache read-only; default: mount ~/.cache read-write if HOME exists
  --ro-node-modules  keep ~/node_modules read-only; default: mount read-write if present
  --writable PATH    extra host path to mount read-write
  --help             show this help

Examples:
  $prog_name
  $prog_name --no-ssh
  $prog_name --model gpt-5
  $prog_name "prompt here"
  $prog_name --no-runtime -- pi
  $prog_name --ro-bun
  $prog_name --ro-cache
  $prog_name --ro-node-modules
EOF
}

hide_ssh=0
hide_runtime_dir=0
ro_bun=0
ro_cache=0
ro_node_modules=0
extra_writable=()
command_mode=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-ssh) hide_ssh=1 ;;
    --no-runtime) hide_runtime_dir=1 ;;
    --ro-bun) ro_bun=1 ;;
    --ro-cache) ro_cache=1 ;;
    --ro-node-modules) ro_node_modules=1 ;;
    --writable)
      [ "$#" -ge 2 ] || { echo "--writable requires a path" >&2; exit 1; }
      extra_writable+=("$2")
      shift
      ;;
    --help) print_help; exit 0 ;;
    --) command_mode=1; shift; break ;;
    *) break ;;
  esac
  shift
done

if [ "$command_mode" -eq 1 ]; then
  [ "$#" -gt 0 ] || {
    echo "-- requires a command" >&2
    exit 1
  }
elif [ "$#" -eq 0 ]; then
  set -- pi
else
  set -- pi "$@"
fi

repo_dir=$(pwd -P)
home_dir=${HOME:?HOME is not set}
xdg_runtime_dir=${XDG_RUNTIME_DIR:?XDG_RUNTIME_DIR is not set}
[ -d "$home_dir" ]
[ -d "$xdg_runtime_dir" ]

args=(
  --die-with-parent
  --new-session
  --ro-bind / /
  --bind "$repo_dir" "$repo_dir"
  --dev /dev
  --proc /proc
  --tmpfs /tmp
  --tmpfs /var/tmp
  --chdir "$repo_dir"
)

mkdir -p "$home_dir/.pi"
extra_writable+=("$home_dir/.pi")

if [ "$ro_bun" -eq 0 ]; then
  mkdir -p "$home_dir/.bun"
  extra_writable+=("$home_dir/.bun")
fi

if [ "$ro_cache" -eq 0 ]; then
  mkdir -p "$home_dir/.cache"
  extra_writable+=("$home_dir/.cache")
fi

if [ "$hide_ssh" -eq 1 ]; then
  args+=(--tmpfs "$home_dir/.ssh")
fi

if [ "$ro_node_modules" -eq 0 ] && [ -e "$home_dir/node_modules" ]; then
  extra_writable+=("$home_dir/node_modules")
fi

if [ "$hide_runtime_dir" -eq 1 ]; then
  args+=(--tmpfs "$xdg_runtime_dir")
fi

for path in "${extra_writable[@]}"; do
  real_path=$(realpath "$path")
  args+=(--bind "$real_path" "$real_path")
done

exec bwrap "${args[@]}" -- "$@"
