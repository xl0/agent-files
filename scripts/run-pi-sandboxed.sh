#!/usr/bin/env bash
set -euo pipefail

prog_name=${0##*/}

if ! command -v bwrap >/dev/null 2>&1; then
  echo "bwrap not found. Install bubblewrap." >&2
  exit 1
fi

print_help() {
  cat >&2 <<EOF
Usage: $prog_name [--no-ssh] [--no-runtime] [--no-bun] [--no-cache] [--writable PATH ...] [PI_ARG ...]
       $prog_name [--no-ssh] [--no-runtime] [--no-bun] [--no-cache] [--writable PATH ...] [-- COMMAND [ARG ...]]

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
- XDG runtime dir mounted read-only by default

Options:
  --no-ssh           hide ~/.ssh with an empty tmpfs
  --no-runtime       hide XDG_RUNTIME_DIR (/run/user/<uid>) with an empty tmpfs
                     default: mount XDG_RUNTIME_DIR read-only if present
  --no-bun           hide ~/.bun; default: mount ~/.bun read-write if HOME exists
  --no-cache         hide ~/.cache; default: mount ~/.cache read-write if HOME exists
  --writable PATH    extra host path to mount read-write
  --help             show this help

Examples:
  $prog_name
  $prog_name --no-ssh
  $prog_name --model gpt-5
  $prog_name "prompt here"
  $prog_name --no-runtime -- pi
  $prog_name --no-bun
  $prog_name --no-cache
EOF
}

hide_ssh=0
hide_runtime_dir=0
hide_bun=0
hide_cache=0
extra_writable=()
command_mode=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-ssh)
      hide_ssh=1
      shift
      ;;
    --no-runtime)
      hide_runtime_dir=1
      shift
      ;;
    --no-bun)
      hide_bun=1
      shift
      ;;
    --no-cache)
      hide_cache=1
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
      command_mode=1
      shift
      break
      ;;
    *)
      break
      ;;
  esac
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

if [ -n "$home_dir" ] && [ -d "$home_dir" ]; then
  pi_home_dir="$home_dir/.pi"
  mkdir -p "$pi_home_dir"
  extra_writable+=("$pi_home_dir")

  if [ "$hide_bun" -eq 0 ]; then
    bun_home_dir="$home_dir/.bun"
    mkdir -p "$bun_home_dir"
    extra_writable+=("$bun_home_dir")
  fi

  cache_home_dir="$home_dir/.cache"
  if [ "$hide_cache" -eq 1 ]; then
    if [ -e "$cache_home_dir" ]; then
      args+=(--tmpfs "$cache_home_dir")
    fi
  else
    mkdir -p "$cache_home_dir"
    extra_writable+=("$cache_home_dir")
  fi

  if [ "$hide_ssh" -eq 1 ] && [ -e "$home_dir/.ssh" ]; then
    args+=(--tmpfs "$home_dir/.ssh")
  fi
fi

if [ -n "$xdg_runtime_dir" ] && [ -d "$xdg_runtime_dir" ]; then
  if [ "$hide_runtime_dir" -eq 1 ]; then
    args+=(--tmpfs "$xdg_runtime_dir")
  else
    args+=(--ro-bind "$xdg_runtime_dir" "$xdg_runtime_dir")
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
