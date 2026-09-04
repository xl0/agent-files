#!/bin/bash
# Gate on git commit/push: deny unless the command carries a GIT_OK= marker.
# The deny reason instructs the agent to re-check the CURRENT user message
# and, only if it explicitly authorizes the action, retry with
#   GIT_OK='<the authorizing words>' git push ...
# — turning momentum into a deliberate, transcript-visible claim.
cmd=$(jq -r '.tool_input.command // ""')
if grep -qE '\bgit\b.*\b(commit|push)\b' <<<"$cmd" && ! grep -q 'GIT_OK=' <<<"$cmd"; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"GATE: two modes (AGENTS.md). Default is user-in-the-loop: do NOT commit/push — the user reviews uncommitted changes; earlier approvals do not carry over. Multi-step workflow mode applies only when the user explicitly put you in it, and even then not when passing control back. If either the current message authorizes this action or you are in an explicitly-instructed multi-step workflow, re-run prefixed with GIT_OK='<quote the authorizing words>'. Otherwise do the work, report, and wait."}}
JSON
fi
exit 0
