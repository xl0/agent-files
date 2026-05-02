## TypeScript / Node / Svelte
- Always use bun/bunx, not npm
- You may install packages, double-check with the user if in doubt.
- If  project is using shadcn, prefer installing shadcn components over hand-rolled replacements.

### Running the checks

- Run `bun run check` after any changes that have chance of breaking things, but not after trivial changes.
- Run `agent-browser` after major changes only:

  > agent-browser console --clear && agent-browser errors --clear
  > agent-browser navigate ...
  > agent-browser console && agent-browser errors

- Unless you are debugging an active issue, just do a quick check - no screenshots, no or minimal navigation.

Note: we likely already have a dev server running on localhost:5173. If not, don't start the server, ask the user to do so.

### UI

- Keep it clean, err on the side of minimalism.
- Avoid adding custom colors, styles or fonts per element - use pre-defined (layout.css)
- Avoid hardcoded Tailwind values and magic numbers unless there is a concrete layout need.
