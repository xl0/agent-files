import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Text } from "@earendil-works/pi-tui"

// Usage bands reported to the model. Each band is announced once, as a
// persistent session message kept in place (better for cache than
// re-injecting every call). The transcript marker below still fires alongside.
const THRESHOLDS = [25, 50, 75, 85, 95]

const CUSTOM_TYPE = "lovely-ctx-reminder"

interface ReminderData {
	thresholds: number[]
	tokens: number
	contextWindow: number
}

const fired = new Set<number>()

// Returns thresholds crossed by percent that haven't been announced yet,
// marking them announced. Re-arms bands usage dropped below (e.g. after
// compaction) so they can announce again as the context regrows.
function takeFreshThresholds(percent: number): number[] {
	const crossed = THRESHOLDS.filter(t => percent >= t)
	for (const t of THRESHOLDS) if (percent < t) fired.delete(t)
	const fresh = crossed.filter(t => !fired.has(t))
	for (const t of fresh) fired.add(t)
	return fresh
}

function formatTokens(n: number): string {
	return n.toLocaleString("en-US")
}

function buildReminder(tokens: number, contextWindow: number): string {
	const pct = Math.round((tokens / contextWindow) * 100)
	return `Context usage now ~${pct}% (${formatTokens(tokens)} / ${formatTokens(contextWindow)} tokens).`
}

export default function (pi: ExtensionAPI) {
	// Transcript rendering for the display-only entries below.
	// Custom entries never participate in LLM context.
	pi.registerEntryRenderer(CUSTOM_TYPE, entry => {
		const data = entry.data as ReminderData
		return new Text(buildReminder(data.tokens, data.contextWindow))
	})

	pi.on("session_start", (_event, ctx) => {
		fired.clear()
		// Don't re-announce thresholds recorded in a resumed session.
		// Custom messages (the kept reminders) persist as custom_message entries.
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === CUSTOM_TYPE) {
				for (const t of (entry.data as ReminderData | undefined)?.thresholds ?? []) fired.add(t)
			} else if (entry.type === "custom_message" && entry.customType === CUSTOM_TYPE) {
				for (const t of (entry.details as ReminderData | undefined)?.thresholds ?? []) fired.add(t)
			}
		}
	})

	// Same announcement for thresholds crossed by the user's own message
	// (e.g. a huge @file paste answered without tools). Returned inline,
	// so it joins the starting turn — never a spare one.
	pi.on("before_agent_start", async (_event, ctx) => {
		const usage = ctx.getContextUsage()
		const percent = usage?.percent
		const tokens = usage?.tokens
		const contextWindow = usage?.contextWindow
		if (percent == null || tokens == null || contextWindow == null) return

		const fresh = takeFreshThresholds(percent)
		if (fresh.length === 0) return

		const data: ReminderData = { thresholds: fresh, tokens, contextWindow }
		pi.appendEntry<ReminderData>(CUSTOM_TYPE, data)

		return {
			message: {
				customType: CUSTOM_TYPE,
				content: buildReminder(tokens, contextWindow),
				display: false,
				details: data
			}
		}
	})
	// One-shot persistent injection after tool calls: toolResults non-empty
	// guarantees the loop continues with another LLM call, so steer delivery
	// lands ahead of it and can never trigger a spare turn after the
	// final response. The message stays in the session (kept in place).
	pi.on("turn_end", async (event, ctx) => {
		if (event.toolResults.length === 0) return
		const usage = ctx.getContextUsage()
		const percent = usage?.percent
		const tokens = usage?.tokens
		const contextWindow = usage?.contextWindow
		if (percent == null || tokens == null || contextWindow == null) return

		const crossed = THRESHOLDS.filter(t => percent >= t)
		if (crossed.length === 0) return

		const fresh = takeFreshThresholds(percent)
		if (fresh.length === 0) return

		const data: ReminderData = { thresholds: fresh, tokens, contextWindow }

		// User-visible transcript marker. Display-only: not sent to the model,
		// and appending never triggers a turn.
		pi.appendEntry<ReminderData>(CUSTOM_TYPE, data)

		pi.sendMessage(
			{
				customType: CUSTOM_TYPE,
				content: buildReminder(tokens, contextWindow),
				display: false,
				details: data
			},
			{ deliverAs: "steer" }
		)
	})
}
