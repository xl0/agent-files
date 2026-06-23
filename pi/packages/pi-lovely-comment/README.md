# @xl0/pi-lovely-comment

Lovely Pi package for the `/comment` extension.

Inspired by this workflow:

<p align="start">
  <a href="https://www.youtube.com/watch?v=DPgJjRdQWrg&t=3813s">
    <img src="https://img.youtube.com/vi/DPgJjRdQWrg/maxresdefault.jpg" alt="Watch the inspiration video on YouTube" width="640">
  </a>
</p>

## Install

```bash
pi install npm:@xl0/pi-lovely-comment
```

## Usage

### Sync

- `/comment`
- `/comment sync`
- `/comment sync <filename.md>` # Quote (`> `) the last assistant message into file, open it in the configured editor, and keep the pi prompt synced with the draft contents.

While sync is active:

- `Esc` stops syncing and leaves the prompt content as-is.
- `Ctrl-C` cancels syncing and clears the prompt.
- Sending the prompt (Enter) submits the latest synced draft.

If called without a filename, the temporary draft will be created in `.pi/comment/` and deleted after the sync is done.

### Save

- `/comment <filename.md>` — same as save.
- `/comment save <filename.md>` — save the last assistant message to `<filename.md>` without quote markers or prompt sync, then open it in the configured editor.

Save the last assistant message and open it in the editor.

### Settings

- `/comment settings` — choose the editor.

The default editor is `$EDITOR`, but you can set a bunch of popular editors in settings, or a custom command.

Editor settings are stored in `~/.pi/agent/xl0-pi-lovely-comment.json`.
