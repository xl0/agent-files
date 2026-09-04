# pi-lovely-ctx-reminder

Notifies the model when context usage crosses 25%, 50%, 75%, 85%, and 95% of the model's context window.

## Install

```bash
pi install npm:@xl0/pi-lovely-ctx-reminder
```

For local development:

```bash
pi -e ./pi/packages/pi-lovely-ctx-reminder
```

## Message format

```text
Context usage now ~50% (524,288 / 1,048,576 tokens).
```

## Usage

No commands. The extension announces each crossed threshold once, as a persistent message kept in the session — via `before_agent_start` when the user's own message crosses it, or via `turn_end` + `steer` delivery after tool calls. No per-call re-injection, cache-friendly.

- Safe delivery: injection only happens on turns that ran tools, which guarantees the loop continues — `steer` can never trigger a spare turn after the final response.
- Each crossing also appends a display-only transcript entry (via `appendEntry` + entry renderer): user-visible, never sent to the model, never triggers a turn. Resume-safe: announced thresholds are rebuilt from session entries on `session_start`, so no duplicates.
- Each threshold announces once. Announced thresholds re-arm when usage drops below them (e.g. after `/compact`), so they can announce again as the context regrows.
- Unknown usage (no model, or no post-compaction LLM response yet) is skipped silently.
