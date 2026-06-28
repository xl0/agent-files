#!/usr/bin/env bash
set -euo pipefail

prog_name=${0##*/}

if ! command -v bwrap >/dev/null 2>&1; then
  echo "bwrap not found. Install bubblewrap." >&2
  exit 1
fi

print_help() {
  cat >&2 <<EOF
Usage: $prog_name [--no-ssh] [--no-runtime] [--ro-runtime] [--ro-bun] [--ro-npm] [--ro-cache] [--ro-vscode] [--ro-node-modules] [--no-cuda] [--writable PATH ...] [PI_ARG ...]
       $prog_name [--no-ssh] [--no-runtime] [--ro-runtime] [--ro-bun] [--ro-npm] [--ro-cache] [--ro-vscode] [--ro-node-modules] [--no-cuda] [--writable PATH ...] [-- COMMAND [ARG ...]]

Runs 'pi' in bubblewrap by default.
Use '-- COMMAND ...' to run something other than 'pi'.

Bubblewrap setup:
- host / mounted read-only
- current repo mounted read-write
- repo .pi/sandbox/tmp mounted at /tmp
- repo .pi/sandbox/var-tmp mounted at /var/tmp
- network allowed by default
- ~/.pi mounted read-write by default
- ~/.bun mounted read-write by default
- ~/.npm mounted read-write by default
- ~/.cache mounted read-write by default
- VS Code user-data dirs mounted read-write by default if present
- ~/.config/matplotlib hidden behind an empty writable tmpfs
- ~/node_modules mounted read-write by default if present
- XDG runtime dir mounted read-write by default
- NVIDIA device nodes mounted by default if present, so CUDA/nvidia-smi can work

Options:
  --no-ssh           hide ~/.ssh with an empty tmpfs
  --no-runtime       hide XDG_RUNTIME_DIR (/run/user/<uid>) with an empty tmpfs
                     default: mount XDG_RUNTIME_DIR read-write if present
  --ro-runtime       keep XDG_RUNTIME_DIR read-only
  --ro-bun           keep ~/.bun read-only; default: mount ~/.bun read-write if HOME exists
  --ro-npm           keep ~/.npm read-only; default: mount ~/.npm read-write if HOME exists
  --ro-cache         keep ~/.cache read-only; default: mount ~/.cache read-write if HOME exists
  --ro-vscode        keep VS Code user-data dirs read-only; default: mount existing dirs read-write
  --ro-node-modules  keep ~/node_modules read-only; default: mount read-write if present
  --no-cuda          do not mount NVIDIA device nodes into the sandbox
  --writable PATH    extra host path to mount read-write
  --help             show this help

Examples:
  $prog_name
  $prog_name --no-ssh
  $prog_name --model gpt-5
  $prog_name "prompt here"
  $prog_name --no-runtime -- pi
  $prog_name --ro-runtime
  $prog_name --ro-bun
  $prog_name --ro-npm
  $prog_name --ro-cache
  $prog_name --ro-vscode
  $prog_name --ro-node-modules
EOF
}

hide_ssh=0
hide_runtime_dir=0
ro_runtime=0
ro_bun=0
ro_npm=0
ro_cache=0
ro_vscode=0
ro_node_modules=0
mount_cuda=1
extra_writable=()
command_mode=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-ssh) hide_ssh=1 ;;
    --no-runtime) hide_runtime_dir=1 ;;
    --ro-runtime) ro_runtime=1 ;;
    --ro-bun) ro_bun=1 ;;
    --ro-npm) ro_npm=1 ;;
    --ro-cache) ro_cache=1 ;;
    --ro-vscode) ro_vscode=1 ;;
    --ro-node-modules) ro_node_modules=1 ;;
    --no-cuda) mount_cuda=0 ;;
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

sandbox_dir="$repo_dir/.pi/sandbox"
sandbox_tmp_dir="$sandbox_dir/tmp"
sandbox_var_tmp_dir="$sandbox_dir/var-tmp"
mkdir -p "$sandbox_tmp_dir" "$sandbox_var_tmp_dir"
if [ ! -e "$sandbox_dir/.gitignore" ]; then
  printf '*\n' >"$sandbox_dir/.gitignore"
fi
chmod 1777 "$sandbox_tmp_dir" "$sandbox_var_tmp_dir"

args=(
  --die-with-parent
  --ro-bind / /
  --bind "$repo_dir" "$repo_dir"
  --dev /dev
  --proc /proc
  --bind "$sandbox_tmp_dir" /tmp
  --bind "$sandbox_var_tmp_dir" /var/tmp
  --chdir "$repo_dir"
)

mkdir -p "$home_dir/.pi"
extra_writable+=("$home_dir/.pi")

if [ "$ro_bun" -eq 0 ]; then
  mkdir -p "$home_dir/.bun"
  extra_writable+=("$home_dir/.bun")
fi

if [ "$ro_npm" -eq 0 ]; then
  mkdir -p "$home_dir/.npm"
  extra_writable+=("$home_dir/.npm")
fi

if [ "$ro_cache" -eq 0 ]; then
  mkdir -p "$home_dir/.cache"
  extra_writable+=("$home_dir/.cache")
fi

if [ "$ro_vscode" -eq 0 ]; then
  command -v code >/dev/null 2>&1 && mkdir -p "$home_dir/.config/Code"
  command -v code-insiders >/dev/null 2>&1 && mkdir -p "$home_dir/.config/Code - Insiders"
  command -v codium >/dev/null 2>&1 && mkdir -p "$home_dir/.config/VSCodium"

  for vscode_dir in \
    "$home_dir/.config/Code" \
    "$home_dir/.config/Code - Insiders" \
    "$home_dir/.config/VSCodium" \
    "$home_dir/.vscode" \
    "$home_dir/.vscode-insiders" \
    "$home_dir/.vscode-oss" \
    "$home_dir/.vscode-oss-dev" \
    "$home_dir/.vscode-shared" \
    "$home_dir/.vscode-oss-shared"
  do
    [ -e "$vscode_dir" ] && extra_writable+=("$vscode_dir")
  done
fi

mkdir -p "$home_dir/.config"
args+=(--tmpfs "$home_dir/.config/matplotlib")

if [ "$hide_ssh" -eq 1 ]; then
  args+=(--tmpfs "$home_dir/.ssh")
fi

if [ "$ro_node_modules" -eq 0 ] && [ -e "$home_dir/node_modules" ]; then
  extra_writable+=("$home_dir/node_modules")
fi

if [ "$hide_runtime_dir" -eq 1 ]; then
  args+=(--tmpfs "$xdg_runtime_dir")
elif [ "$ro_runtime" -eq 0 ]; then
  extra_writable+=("$xdg_runtime_dir")
fi

if [ "$mount_cuda" -eq 1 ]; then
  if command -v nvidia-modprobe >/dev/null 2>&1; then
    nvidia-modprobe -u -c=0 >/dev/null 2>&1 || true
  fi

  shopt -s nullglob
  nvidia_devices=(/dev/nvidia* /dev/nvidia-caps/nvidia-cap*)
  shopt -u nullglob

  if [ -d /dev/nvidia-caps ]; then
    args+=(--dir /dev/nvidia-caps)
  fi

  for device in "${nvidia_devices[@]}"; do
    [ -c "$device" ] || continue
    args+=(--dev-bind "$device" "$device")
  done
fi

for path in "${extra_writable[@]}"; do
  real_path=$(realpath "$path")
  args+=(--bind "$real_path" "$real_path")
done

exec bwrap "${args[@]}" -- "$@"
