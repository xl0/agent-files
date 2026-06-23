# @xl0/pi-lovely-comment

Pi package for the `/comment` extension.

## Install

From this repository:

```bash
pi install -l ./pi/packages/pi-lovely-comment
```

After installing, restart pi or run `/reload`.

## Usage

- `/comment` or `/comment sync` — quote the last assistant message into a temporary Markdown draft, open it in the configured editor, and keep the pi prompt synced with the draft contents.
- `/comment sync <filename>` — same as sync, but use `<filename>` and keep the file after sync stops.
- `/comment save <filename>` — save the last assistant message to `<filename>` without quote markers or prompt sync, then open it in the configured editor.
- `/comment settings` — choose the GUI editor used for sync drafts.

Explicit filenames are resolved relative to the current project unless absolute. Existing files are not overwritten.

While sync is active:

- `Esc` stops syncing and leaves the prompt content as-is.
- `Ctrl-C` cancels syncing and clears the prompt.
- Sending the prompt submits the latest synced draft.

Drafts are created under `.pi/comment/` in the current project and are ignored by git.

## Package contents

- `extensions/comment.ts` — Pi extension entrypoint.
