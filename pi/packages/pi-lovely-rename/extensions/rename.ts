import type { SimpleStreamOptions } from "@earendil-works/pi-ai"
import { completeSimple } from "@earendil-works/pi-ai/compat"
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent"
import { defineScopedConfig, field, ScopedConfigEditor } from "@xl0/pi-lovely-config"

const STATUS_KEY = "rename"
const MAX_CONVERSATION_CHARS = 60_000
const NAMING_SYSTEM_PROMPT = `You name coding-agent sessions.
Return only the session name, no quotes, no punctuation-only decoration.`

const NAMING_PROMPT = `Create a short, specific display name for this Pi coding-agent session.
Prefer an imperative or noun phrase that captures the actual task.
Use 3 to 8 words. Avoid generic names like "Coding Session" or "Project Work".
Do not answer the prior task.
Return exactly one line containing only the name.`

const renameConfig = defineScopedConfig({
	fileName: "xl0-pi-lovely-rename.json",
	scope: "user",
	schema: {
		afterSteps: field.number(6, {
			label: "Auto-rename after assistant turns",
			description: "Automatically name unnamed sessions after this many assistant turns. Set to 0 to disable this trigger.",
			min: 0,
			step: 1
		}),
		afterTokens: field.number(0, {
			label: "Auto-rename after consumed tokens",
			description:
				"Automatically name unnamed sessions after this many cumulative assistant-reported tokens. Set to 0 to disable this trigger.",
			min: 0,
			step: 1000
		}),
		prompt: field.text(NAMING_PROMPT, {
			label: "Naming prompt",
			description: "Prompt prepended to the serialized conversation when generating the session name."
		})
	}
})

type RenameConfig = typeof renameConfig.defaults

let config: RenameConfig | undefined

function buildConversationText(branch: readonly SessionEntry[]): string {
	const sections: string[] = []

	for (const entry of branch) {
		if (entry.type !== "message") continue

		const message = entry.message
		if (message.role === "user") {
			const text = (
				typeof message.content === "string"
					? message.content
					: message.content.flatMap(block => (block.type === "text" ? [block.text] : [])).join("\n")
			).trim()
			if (text) sections.push(`User: ${text}`)
			continue
		}

		if (message.role === "assistant") {
			const lines: string[] = []
			const text = message.content
				.flatMap(block => (block.type === "text" ? [block.text] : []))
				.join("\n")
				.trim()
			if (text) lines.push(`Assistant: ${text}`)
			lines.push(
				...message.content.flatMap(block => {
					if (block.type !== "toolCall") return []
					return [`Tool ${block.name} called with args ${JSON.stringify(block.arguments)}`]
				})
			)
			if (lines.length > 0) sections.push(lines.join("\n"))
		}
	}

	const conversation = sections.join("\n\n")
	if (conversation.length <= MAX_CONVERSATION_CHARS) return conversation
	return `[Earlier conversation omitted]\n${conversation.slice(-MAX_CONVERSATION_CHARS)}`
}

function sanitizeName(text: string): string | undefined {
	const [firstLine = ""] = text.trim().split(/\r?\n/)
	const name = firstLine
		.replace(/\s+/g, " ") // Fold space
		.slice(0, 80)
		.trim()

	return name || undefined
}

function loadConfig(ctx: ExtensionContext): void {
	try {
		renameConfig.load(ctx.cwd)
		if (renameConfig.warnings.length > 0) {
			ctx.ui.notify(renameConfig.warnings.map(warning => `${warning.path}: ${warning.message}`).join("\n"), "warning")
		}
		config = renameConfig.value
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		ctx.ui.notify(`Ignored unreadable Rename config: ${message}`, "warning")
		config = undefined
	}
}

async function showSettings(ctx: ExtensionCommandContext): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("/rename settings requires interactive TUI mode", "error")
		return
	}

	if (!config) {
		ctx.ui.notify(`Fix or remove ${renameConfig.path("user", ctx.cwd)} before editing /rename settings.`, "error")
		return
	}

	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) =>
			new ScopedConfigEditor({
				tui,
				theme,
				config: renameConfig,
				onChange(nextConfig) {
					config = nextConfig.value
				},
				done
			})
	)
	config = renameConfig.value
}

async function generateSessionName(ctx: ExtensionContext, config: RenameConfig): Promise<string> {
	const conversation = buildConversationText(ctx.sessionManager.getBranch())
	if (!conversation.trim()) throw new Error("No conversation found to name")

	const model = ctx.model
	if (!model) throw new Error("No current model selected")

	if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
		throw new Error(`No auth configured for ${model.provider}/${model.id}`)
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model)
	if (!auth.ok) throw new Error(auth.error)

	const options: SimpleStreamOptions = {
		maxTokens: 64
	}
	if (auth.apiKey) options.apiKey = auth.apiKey
	if (auth.headers) options.headers = auth.headers
	if (auth.env) options.env = auth.env

	const response = await completeSimple(
		model,
		{
			systemPrompt: NAMING_SYSTEM_PROMPT,
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: `${config.prompt.trim()}\n\nConversation:\n${conversation}` }],
					timestamp: Date.now()
				}
			]
		},
		options
	)

	if (response.stopReason === "error") throw new Error(response.errorMessage || "Naming model returned an error")
	if (response.stopReason === "aborted") throw new Error("Naming was aborted")

	const text = response.content.flatMap(block => (block.type === "text" ? [block.text] : [])).join("\n")
	const name = sanitizeName(text)
	if (!name) throw new Error("Naming model returned an empty name")
	return name
}

let autoRenameRunning = false

export default function (pi: ExtensionAPI) {
	pi.registerCommand("rename", {
		description: "Generate a session name",
		handler: async (args, ctx) => {
			const trimmed = args.trim()

			if (trimmed === "settings" || trimmed === "config") {
				await showSettings(ctx)
				return
			}

			await ctx.waitForIdle()

			if (!config) {
				ctx.ui.notify(`Fix or remove ${renameConfig.path("user", ctx.cwd)} before using /rename.`, "warning")
				return
			}

			ctx.ui.setStatus(STATUS_KEY, "renaming…")
			try {
				const name = await generateSessionName(ctx, config)
				pi.setSessionName(name)
				ctx.ui.notify(`Session name set: ${name}`, "info")
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error")
			} finally {
				ctx.ui.setStatus(STATUS_KEY, undefined)
			}
		}
	})

	pi.on("agent_end", async (_event, ctx) => {
		if (autoRenameRunning || pi.getSessionName()) return

		if (!config) return

		let assistantTurns = 0
		let consumedTokens = 0
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message" || entry.message.role !== "assistant") continue
			assistantTurns += 1
			const usage = entry.message.usage
			consumedTokens += usage.totalTokens > 0 ? usage.totalTokens : usage.input + usage.output + usage.cacheRead + usage.cacheWrite
		}

		const stepTrigger = config.afterSteps > 0 && assistantTurns >= config.afterSteps
		const tokenTrigger = config.afterTokens > 0 && consumedTokens >= config.afterTokens
		if (!stepTrigger && !tokenTrigger) return

		autoRenameRunning = true
		ctx.ui.setStatus(STATUS_KEY, "renaming…")
		try {
			const name = await generateSessionName(ctx, config)
			pi.setSessionName(name)
			ctx.ui.notify(`Session name set: ${name}`, "info")
		} catch (error) {
			ctx.ui.notify(`Auto-rename failed: ${error instanceof Error ? error.message : String(error)}`, "warning")
		} finally {
			ctx.ui.setStatus(STATUS_KEY, undefined)
			autoRenameRunning = false
		}
	})

	pi.on("session_shutdown", async () => {
		autoRenameRunning = false
	})

	pi.on("session_start", async (_event, ctx) => {
		loadConfig(ctx)
	})
}
