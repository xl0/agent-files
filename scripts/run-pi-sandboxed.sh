#!/usr/bin/env bash
set -euo pipefail

prog_name=${0##*/}

if ! command -v bwrap >/dev/null 2>&1; then
  echo "bwrap not found. Install bubblewrap." >&2
  exit 1
fi

print_help() {
  cat >&2 <<EOF
Usage: $prog_name [--no-net] [--runtime-dir] [--writable PATH ...] [PI_ARG ...]
       $prog_name [--no-net] [--runtime-dir] [--writable PATH ...] [-- COMMAND [ARG ...]]

Runs 'pi' in bubblewrap by default.
Use '-- COMMAND ...' to run something other than 'pi'.

Bubblewrap setup:
- host / mounted read-only
- current repo mounted read-write
- private /tmp
- network allowed by default
- ~/.pi mounted read-write by default
- XDG runtime dir hidden by default

Options:
  --no-net           disable network access
  --runtime-dir      mount XDG_RUNTIME_DIR read-only if present
  --writable PATH    extra host path to mount read-write
  --help             show this help

Examples:
  $prog_name
  $prog_name --no-net
  $prog_name --model gpt-5
  $prog_name "prompt here"
  $prog_name --runtime-dir -- pi
EOF
}

allow_net=1
mount_runtime_dir=0
extra_writable=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-net)
      allow_net=0
      shift
      ;;
    --runtime-dir)
      mount_runtime_dir=1
      shift
      ;;
    --writable)
      [ "$#" -ge 2 ] || {
        echo "--writable requires a path" >&2
        exit 1
      }
      extra_writable+=("$2")
      shift 2
      ;;
    --help)
      print_help
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if [ "$#" -eq 0 ]; then
  set -- pi
else
  set -- pi "$@"
fi

repo_dir=$(pwd -P)
home_dir=${HOME:-}
xdg_runtime_dir=${XDG_RUNTIME_DIR:-}

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

if [ "$allow_net" -eq 0 ]; then
  args+=(--unshare-net)
fi

if [ -n "$home_dir" ] && [ -d "$home_dir" ]; then
  pi_home_dir="$home_dir/.pi"
  mkdir -p "$pi_home_dir"
  extra_writable+=("$pi_home_dir")
fi

if [ -n "$xdg_runtime_dir" ] && [ -d "$xdg_runtime_dir" ]; then
  if [ "$mount_runtime_dir" -eq 1 ]; then
    args+=(--ro-bind "$xdg_runtime_dir" "$xdg_runtime_dir")
  else
    args+=(--tmpfs "$xdg_runtime_dir")
  fi
fi

for path in "${extra_writable[@]}"; do
  if [ ! -e "$path" ]; then
    echo "Writable path does not exist: $path" >&2
    exit 1
  fi
  real_path=$(realpath "$path")
  args+=(--bind "$real_path" "$real_path")
done

exec bwrap "${args[@]}" -- "$@"
