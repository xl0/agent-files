import { spawn } from "node:child_process"
import { type FSWatcher, readFileSync, rmSync, watch } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join } from "node:path"
import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@earendil-works/pi-coding-agent"
import { matchesKey } from "@earendil-works/pi-tui"
import { defineScopedConfig, field, ScopedConfigEditor } from "@xl0/pi-lovely-config"

const STATUS_KEY = "comment"
const USAGE_TEXT = "Usage: /comment [filename] | sync [filename] | save <filename> | settings"

const commentConfig = defineScopedConfig({
	fileName: "xl0-pi-lovely-comment.json",
	scope: "user",
	schema: {
		editor: field.enum(["$EDITOR", "code", "cursor", "zed", "windsurf", "freeform"], "$EDITOR", {
			label: "Editor",
			description: "GUI editor used for /comment drafts and saved assistant messages.",
			valueDescriptions: {
				$EDITOR: "Command from the EDITOR environment variable.",
				code: "Command: code {file}",
				cursor: "Command: cursor {file}",
				zed: "Command: zed {file}",
				windsurf: "Command: windsurf {file}",
				freeform: "Use the Freeform command."
			}
		}),
		freeformCommand: field.string("", {
			label: "Freeform command",
			description: "Shell command for the Freeform editor preset. Use {file}, or the file path is appended.",
			depth: 1,
			visibleWhen: ({ get }) => get("editor") === "freeform"
		})
	}
})

type ActiveComment = {
	file: string
	cleanupFile: boolean
	ctx: ExtensionCommandContext
	watcher?: FSWatcher
	lastText: string
	unsubscribeInput?: () => void
}

type ParsedCommentArgs =
	| { action: "settings" }
	| { action: "help" }
	| { action: "sync"; file?: string }
	| { action: "save"; file: string }
	| { action: "error"; message: string }

let active: ActiveComment | undefined

function editorCommandLine(config: typeof commentConfig.defaults): string | undefined {
	const editor = config.editor
	if (editor === "$EDITOR") return (process.env as { EDITOR?: string }).EDITOR?.trim() || undefined
	if (editor === "freeform") return config.freeformCommand.trim() || undefined
	return `${editor} {file}`
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`
}

function commandLineForFile(commandLine: string, file: string): string {
	const quotedFile = shellQuote(file)
	return commandLine.includes("{file}") ? commandLine.replaceAll("{file}", quotedFile) : `${commandLine} ${quotedFile}`
}

function launchEditor(commandLine: string, file: string, onFailure: (message: string) => void): void {
	const launchCommandLine = commandLineForFile(commandLine, file)
	let failed = false
	const failOnce = (message: string) => {
		if (failed) return
		failed = true
		onFailure(message)
	}

	spawn(launchCommandLine, {
		detached: true,
		stdio: "ignore",
		shell: true
	})
		.on("error", error => {
			failOnce(`failed to launch comment editor: ${error.message}`)
		})
		.on("close", (code, signal) => {
			if (code === 0) return
			const detail = signal ? `signal ${signal}` : `exit code ${code}`
			failOnce(`comment editor failed (${detail})`)
		})
		.unref()
}

function unquote(value: string): string {
	return value.replace(/^(['"])([\s\S]*)\1$/, "$2")
}

function parseCommentArgs(args: string | undefined): ParsedCommentArgs {
	const trimmed = (args ?? "").trim()
	if (!trimmed) return { action: "sync" }

	const [, command = "", rest = ""] = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed) ?? []
	if (command === "settings" || command === "config") return { action: "settings" }
	if (command === "help" || command === "--help" || command === "-h") return { action: "help" }
	if (command === "sync") return rest ? { action: "sync", file: unquote(rest.trim()) } : { action: "sync" }
	if (command === "save") {
		if (!rest) return { action: "error", message: `/comment save requires a filename. ${USAGE_TEXT}` }
		return { action: "save", file: unquote(rest.trim()) }
	}

	return { action: "save", file: unquote(trimmed) }
}

function resolveUserFile(ctx: ExtensionCommandContext, filename: string): string {
	const trimmed = filename.trim()
	if (!trimmed) throw new Error("Filename is empty")
	return isAbsolute(trimmed) ? trimmed : join(ctx.cwd, trimmed)
}

function getLastAssistantText(ctx: ExtensionCommandContext): string | undefined {
	let text: string | undefined
	const branch = ctx.sessionManager.getBranch()
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i]
		if (entry?.type !== "message") continue

		const message = entry.message
		if (message.role !== "assistant") continue

		text = message.content.flatMap(block => (block.type === "text" ? [block.text] : [])).join("\n")

		if (text.trim()) return text
	}
	return undefined
}

function quoteText(text: string): string {
	return text
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map(line => `> ${line}`)
		.join("\n")
}

async function writeNewFile(file: string, text: string): Promise<void> {
	await mkdir(dirname(file), { recursive: true })
	await writeFile(file, text, { encoding: "utf8", flag: "wx" })
}

async function createSyncDraft(
	ctx: ExtensionCommandContext,
	initialText: string,
	requestedFile: string | undefined
): Promise<{
	file: string
	cleanupFile: boolean
}> {
	if (requestedFile) {
		const file = resolveUserFile(ctx, requestedFile)
		await writeNewFile(file, initialText)
		return { file, cleanupFile: false }
	}

	const commentDir = join(ctx.cwd, CONFIG_DIR_NAME, "comment")
	await mkdir(commentDir, { recursive: true })
	await writeFile(join(commentDir, ".gitignore"), "*\n", "utf8")

	for (let attempt = 0; attempt < 10; attempt++) {
		const file = join(commentDir, `comment-${Math.random().toString(36).slice(2, 8)}.md`)
		try {
			await writeNewFile(file, initialText)
			return { file, cleanupFile: true }
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
		}
	}

	throw new Error("Could not allocate a unique temporary comment filename")
}

function loadCommandConfig(ctx: ExtensionContext): typeof commentConfig | undefined {
	try {
		commentConfig.load(ctx.cwd)
		if (commentConfig.warnings.length > 0) {
			ctx.ui.notify(commentConfig.warnings.map(warning => `${warning.path}: ${warning.message}`).join("\n"), "warning")
		}
		return commentConfig
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		ctx.ui.notify(`Ignored unreadable Comment config: ${message}`, "warning")
		return undefined
	}
}

async function showSettings(ctx: ExtensionCommandContext): Promise<typeof commentConfig | undefined> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("/comment settings requires interactive TUI mode", "error")
		return undefined
	}

	const loaded = loadCommandConfig(ctx)
	if (!loaded) {
		ctx.ui.notify(`Fix or remove ${commentConfig.path("user", ctx.cwd)} before editing /comment settings.`, "error")
		return undefined
	}

	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) =>
			new ScopedConfigEditor({
				tui,
				theme,
				config: loaded,
				onChange() {},
				done
			})
	)

	return loaded
}

async function configuredEditorCommandLine(ctx: ExtensionCommandContext): Promise<string | undefined> {
	let loaded = loadCommandConfig(ctx)
	let commandLine = editorCommandLine(loaded?.value ?? commentConfig.defaults)

	if (!commandLine) {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("Configure an editor with /comment settings before using /comment.", "error")
			return undefined
		}

		ctx.ui.notify("No /comment editor configured. Opening /comment settings.", "warning")
		loaded = (await showSettings(ctx)) ?? loaded
		commandLine = editorCommandLine(loaded?.value ?? commentConfig.defaults)
	}

	if (!commandLine) {
		ctx.ui.notify("Configure an editor with /comment settings before using /comment.", "error")
		return undefined
	}

	return commandLine
}

function stopActive(): void {
	const state = active
	if (!state) {
		return
	}

	active = undefined
	state.watcher?.close()
	state.unsubscribeInput?.()
	state.ctx.ui.setStatus(STATUS_KEY, undefined)

	if (state.cleanupFile) {
		try {
			rmSync(state.file, { force: true })
		} catch {
			// Best-effort cleanup only. State is already inactive, so never surface this
			// from input/session hooks.
		}
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("comment", {
		description: "Comment on or save the last assistant message",
		handler: async (args, ctx) => {
			const parsed = parseCommentArgs(args)

			if (parsed.action === "settings") {
				await showSettings(ctx)
				return
			}
			if (parsed.action === "help") {
				ctx.ui.notify(USAGE_TEXT, "info")
				return
			}
			if (parsed.action === "error") {
				ctx.ui.notify(parsed.message, "error")
				return
			}

			await ctx.waitForIdle()

			const text = getLastAssistantText(ctx)
			if (!text) {
				ctx.ui.notify("No assistant message found to comment on", "error")
				return
			}

			if (parsed.action === "save") {
				const configuredCommandLine = await configuredEditorCommandLine(ctx)
				if (!configuredCommandLine) return

				try {
					const file = resolveUserFile(ctx, parsed.file)
					await writeNewFile(file, text)
					launchEditor(configuredCommandLine, file, message => ctx.ui.notify(message, "error"))
					ctx.ui.notify(`Saved assistant message and opened editor: ${file}`, "info")
				} catch (error) {
					ctx.ui.notify(`Could not save assistant message: ${(error as Error).message}`, "error")
				}
				return
			}

			if (ctx.mode !== "tui") {
				ctx.ui.notify("/comment requires interactive TUI mode", "error")
				return
			}

			const configuredCommandLine = await configuredEditorCommandLine(ctx)
			if (!configuredCommandLine) return

			stopActive()

			const initialText = quoteText(text)
			let state: ActiveComment

			try {
				state = {
					...(await createSyncDraft(ctx, initialText, parsed.file)),
					ctx,
					lastText: initialText
				}
			} catch (error) {
				ctx.ui.notify(`Could not create comment draft: ${(error as Error).message}`, "error")
				return
			}

			active = state
			ctx.ui.setEditorText(initialText)
			ctx.ui.setStatus(STATUS_KEY, "💬")

			state.unsubscribeInput = ctx.ui.onTerminalInput(data => {
				if (active !== state) return undefined

				if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
					if (matchesKey(data, "ctrl+c")) ctx.ui.setEditorText("")
					stopActive()
					ctx.ui.notify("Comment sync stopped", "info")
					return { consume: true }
				}

				return undefined
			})

			const syncOnce = () => {
				if (active !== state) return

				try {
					const text = readFileSync(state.file, "utf8")
					if (active === state && text !== state.lastText) {
						state.lastText = text
						ctx.ui.setEditorText(text)
					}
				} catch (error) {
					if (active === state) {
						ctx.ui.notify(`comment sync stopped: ${(error as Error).message}`, "warning")
						stopActive()
					}
				}
			}

			state.watcher = watch(dirname(state.file), (_eventType, filename) => {
				if (filename == null || filename === basename(state.file)) syncOnce()
			})
			state.watcher.on("error", error => {
				if (active === state) {
					ctx.ui.notify(`comment sync stopped: ${error.message}`, "warning")
					stopActive()
				}
			})
			syncOnce()

			launchEditor(configuredCommandLine, state.file, message => {
				if (active !== state) return
				ctx.ui.notify(message, "error")
				stopActive()
			})

			ctx.ui.notify(`Comment draft opened: ${state.file} (Esc stops sync, Ctrl-C cancels)`, "info")
		}
	})

	pi.on("input", async event => {
		const state = active
		if (!state || event.source !== "interactive") {
			return { action: "continue" }
		}

		stopActive()
		return { action: "transform", text: state.lastText }
	})

	pi.on("agent_start", async () => {
		stopActive()
	})

	pi.on("session_shutdown", async () => {
		stopActive()
	})
}
