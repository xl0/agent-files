# pi-lovely-rename

Automatically gives unnamed Pi sessions a short, task-specific name after a configurable amount of conversation.

## Install

Requires Pi 0.80 or newer.

```bash
pi install npm:@xl0/pi-lovely-rename
```

For local development:

```bash
pi -e ./pi/packages/pi-lovely-rename
```

## Usage

The extension auto-renames a session only when it has no session name already. Manual `/rename` regenerates the name even when one is already set.

Defaults:

- rename after 6 assistant turns
- token trigger disabled
- use the current session model for naming

Commands:

```text
/rename                 Generate or regenerate the session name
/rename settings        Configure triggers
```

For explicit names, use Pi's built-in `/name <name>`.

## Configuration

`/rename settings` edits `~/.pi/agent/xl0-pi-lovely-rename.json`.

Fields:

- `afterSteps`: assistant turns before auto-renaming. `0` disables this trigger.
- `afterTokens`: cumulative assistant-reported tokens before auto-renaming. `0` disables this trigger.
- `prompt`: naming prompt prepended to the serialized conversation.

## Model request

Naming uses the current model through `pi-ai` with a compact serialized conversation excerpt and a dedicated naming prompt. It does not modify or reuse the active session system prompt.

## About `/name`

This package does not override Pi's built-in `/name` command in interactive mode. Pi currently handles built-in slash commands before extension commands, so an extension command named `name` is preempted by the TUI built-in. Use `/rename` for LLM-generated names.
