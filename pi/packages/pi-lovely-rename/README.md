# pi-lovely-rename

Automatically gives unnamed Pi sessions a short, task-specific name after a configurable amount of conversation.

## Install

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

- rename after 3 user-agent turns
- token trigger disabled

Commands:

```text
/rename                 Generate or regenerate the session name
/rename settings        Configure triggers
```

For explicit names, use Pi's built-in `/name <name>`.

## Configuration

`/rename settings` edits `~/.pi/agent/xl0-pi-lovely-rename.json`.

Fields:

- `afterSteps`: user-agent turns before auto-renaming. `0` disables this trigger.
- `afterTokens`: cumulative assistant-reported tokens before auto-renaming. `0` disables this trigger.
- `prompt`: naming prompt prepended to the serialized conversation.

## Model request

Naming always uses the current session model through `pi-ai` with a compact serialized conversation excerpt and a dedicated naming prompt. It does not reuse the active session system prompt.

## Related projects

|  |  |
| --- | --- |
| [Pi Lovely Web](https://github.com/xl0/pi-lovely-web) | `web_search`, `web_fetch`, `web_image` via Firecrawl, Exa, Tavily, Brave |
| [Pi Lovely Dev Tools](https://github.com/xl0/pi-lovely-dev-tools) | `/tool`, `/show-sysprompt`, `/show-context`, `/llm-stats` |
| [Pi Lovely Codex](https://github.com/xl0/pi-lovely-codex) | GPT fast mode and Codex-style `apply_patch` |
| [Pi Lovely IDE](https://github.com/xl0/pi-lovely-ide) | IDE integration |
| [Pi Lovely Config](https://github.com/xl0/pi-lovely-config) | scoped config helpers for Pi extensions |
| [Pi Lovely Comment](https://github.com/xl0/agent-files/tree/master/pi/packages/pi-lovely-comment) | open the last assistant message in your editor and sync edits back into the prompt |

---

Like this work? [Hire me](https://alexey.work/cv?ref=pi-lovely-rename)
