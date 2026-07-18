#!/usr/bin/env bash
set -euo pipefail

prog_name=${0##*/}

if ! command -v bwrap >/dev/null 2>&1; then
  echo "bwrap not found. Install bubblewrap." >&2
  exit 1
fi

print_help() {
  cat >&2 <<EOF
Usage: $prog_name [--no-ssh] [--no-runtime] [--ro-runtime] [--ro-bun] [--ro-npm] [--ro-cache] [--ro-conda] [--ro-vscode] [--ro-node-modules] [--no-cuda] [--writable PATH ...] [CLAUDE_ARG ...]
       $prog_name [--no-ssh] [--no-runtime] [--ro-runtime] [--ro-bun] [--ro-npm] [--ro-cache] [--ro-conda] [--ro-vscode] [--ro-node-modules] [--no-cuda] [--writable PATH ...] [-- COMMAND [ARG ...]]

Runs 'claude' in bubblewrap by default.
Use '-- COMMAND ...' to run something other than 'claude'.
When claude is run implicitly, appends a system prompt describing the sandbox.
Claude permission checks are skipped because filesystem access is constrained by bubblewrap.

Bubblewrap setup:
- host / mounted read-only
- current repo mounted read-write
- repo .claude/sandbox/tmp mounted at /tmp
- repo .claude/sandbox/var-tmp mounted at /var/tmp
- network allowed by default
- CLAUDE_CONFIG_DIR mounted read-write (~/.claude by default)
- legacy ~/.claude.json imported into CLAUDE_CONFIG_DIR on first run
- ~/.bun mounted read-write by default
- ~/.npm mounted read-write by default
- ~/.cache mounted read-write by default
- conda/mamba dirs mounted read-write by default
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
  --ro-conda         keep conda/mamba dirs read-only; default: mount ~/.conda,
                     ~/.mamba, detected roots, and configured env/pkg dirs read-write
  --ro-vscode        keep VS Code user-data dirs read-only; default: mount existing dirs read-write
  --ro-node-modules  keep ~/node_modules read-only; default: mount read-write if present
  --no-cuda          do not mount NVIDIA device nodes into the sandbox
  --writable PATH    extra host path to mount read-write
  --help             show this help

Examples:
  $prog_name
  $prog_name --no-ssh
  $prog_name --model sonnet
  $prog_name "prompt here"
  $prog_name --no-runtime -- claude
  $prog_name --ro-runtime
  $prog_name --ro-bun
  $prog_name --ro-npm
  $prog_name --ro-cache
  $prog_name --ro-conda
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
ro_conda=0
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
    --ro-conda) ro_conda=1 ;;
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
  set -- claude
else
  set -- claude "$@"
fi

repo_dir=$(pwd -P)
home_dir=${HOME:?HOME is not set}
xdg_runtime_dir=${XDG_RUNTIME_DIR:?XDG_RUNTIME_DIR is not set}
[ -d "$home_dir" ]
[ -d "$xdg_runtime_dir" ]

# When CLAUDE_CONFIG_DIR is unset, Claude stores state in ~/.claude.json.
# That cannot be updated atomically when HOME is read-only: Claude creates
# sibling lock/temp paths and renames the temp file over the original. Force
# all state under a writable directory instead.
claude_config_dir=$(realpath -m "${CLAUDE_CONFIG_DIR:-$home_dir/.claude}")
if [ "$claude_config_dir" = "$home_dir" ]; then
  echo "CLAUDE_CONFIG_DIR must not be HOME; that would make all of HOME writable" >&2
  exit 1
fi
mkdir -p "$claude_config_dir"

claude_state_file="$claude_config_dir/.claude.json"
legacy_claude_state_file="$home_dir/.claude.json"
if [ ! -e "$claude_state_file" ]; then
  if [ "$claude_state_file" != "$legacy_claude_state_file" ] && [ -f "$legacy_claude_state_file" ]; then
    cp -p -- "$legacy_claude_state_file" "$claude_state_file"
  else
    (umask 077; printf '{}\n' >"$claude_state_file")
  fi
fi

sandbox_dir="$repo_dir/.claude/sandbox"
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
  --setenv CLAUDE_CONFIG_DIR "$claude_config_dir"
)

add_existing_writable() {
  local path=$1
  if [ -e "$path" ]; then
    extra_writable+=("$path")
  fi
  return 0
}

add_writable_dir() {
  local path=$1
  path=$(realpath -m "$path")
  mkdir -p "$path"
  extra_writable+=("$path")
}

add_colon_writable_dirs() {
  local value=${1:-}
  local path
  local paths=()
  local IFS=:

  [ -n "$value" ] || return 0

  read -r -a paths <<<"$value"
  for path in "${paths[@]}"; do
    [ -n "$path" ] || continue
    add_writable_dir "$path"
  done
}

add_tool_prefix_writable() {
  local tool=$1
  local tool_path real_tool prefix

  tool_path=$(command -v "$tool" 2>/dev/null || true)
  [ -n "$tool_path" ] || return 0
  [ -e "$tool_path" ] || return 0

  real_tool=$(realpath "$tool_path" 2>/dev/null || true)
  case "$real_tool" in
    */bin/"$tool")
      prefix=${real_tool%/bin/$tool}
      [ -e "$prefix/conda-meta" ] || [ -e "$prefix/pkgs" ] || [ -e "$prefix/envs" ] || return 0
      add_existing_writable "$prefix"
      ;;
  esac
  return 0
}

add_conda_base_writable() {
  local tool=$1
  local base

  command -v "$tool" >/dev/null 2>&1 || return 0
  base=$("$tool" info --base 2>/dev/null | awk 'NF { print; exit }' || true)
  [ -n "$base" ] || return 0
  [ -e "$base/conda-meta" ] || [ -e "$base/pkgs" ] || [ -e "$base/envs" ] || return 0
  add_existing_writable "$base"
}

extra_writable+=("$claude_config_dir")

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

if [ "$ro_conda" -eq 0 ]; then
  add_writable_dir "$home_dir/.conda"
  add_writable_dir "$home_dir/.mamba"
  add_writable_dir "$home_dir/.micromamba"

  for conda_dir in \
    "$home_dir/anaconda3" \
    "$home_dir/miniconda3" \
    "$home_dir/miniforge3" \
    "$home_dir/mambaforge" \
    "$home_dir/micromamba"
  do
    add_existing_writable "$conda_dir"
  done

  [ -n "${MAMBA_ROOT_PREFIX:-}" ] && add_writable_dir "$MAMBA_ROOT_PREFIX"
  add_colon_writable_dirs "${CONDA_ENVS_PATH:-}"
  add_colon_writable_dirs "${CONDA_PKGS_DIRS:-}"
  add_tool_prefix_writable conda
  add_tool_prefix_writable mamba
  add_conda_base_writable conda
  add_conda_base_writable mamba
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

bound_writable=()
for path in "${extra_writable[@]}"; do
  real_path=$(realpath "$path")
  already_bound=0
  for bound_path in "${bound_writable[@]}"; do
    if [ "$bound_path" = "$real_path" ]; then
      already_bound=1
      break
    fi
  done
  [ "$already_bound" -eq 1 ] && continue

  bound_writable+=("$real_path")
  args+=(--bind "$real_path" "$real_path")
done

if [ "$command_mode" -eq 0 ]; then
  sandbox_prompt="You are running inside a bubblewrap sandbox.
The host filesystem is read-only except for these writable mount points:
- $repo_dir (current repository)
- /tmp -> $sandbox_tmp_dir
- /var/tmp -> $sandbox_var_tmp_dir"

  for path in "${bound_writable[@]}"; do
    [ "$path" = "$repo_dir" ] && continue
    sandbox_prompt+=$'\n- '"$path"
  done

  sandbox_prompt+=$'\nIf you run into a sandbox limitation, pause the current task and ask the user to adjust the sandbox'

  set -- "$1" --dangerously-skip-permissions --append-system-prompt "$sandbox_prompt" "${@:2}"
fi

exec bwrap "${args[@]}" -- "$@"
