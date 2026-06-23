import { spawn } from "node:child_process"
import { type FSWatcher, readFileSync, rmSync, watch } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join } from "node:path"
import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@earendil-works/pi-coding-agent"
import { matchesKey } from "@earendil-works/pi-tui"
import {
	type ConfigFromFields,
	defineScopedConfigSpec,
	type ResolvedConfig,
	ScopedConfigEditor,
	type ScopedConfigField,
	type ScopedConfigPatch,
	ScopedConfigState
} from "@xl0/pi-lovely-config"

const STATUS_KEY = "comment"
const FREEFORM_PRESET_ID = "freeform"
const ENV_EDITOR_PRESET_ID = "$EDITOR"
const CONFIG_FILE_NAME = "xl0-pi-lovely-comment.json"
const EDITOR_PRESET_IDS = [ENV_EDITOR_PRESET_ID, "code", "cursor", "zed", "windsurf", FREEFORM_PRESET_ID] as const

type EditorPresetId = (typeof EDITOR_PRESET_IDS)[number]

type EditorPreset = {
	id: EditorPresetId
	label: string
	commandLine?: string
}

const EDITOR_PRESETS: EditorPreset[] = [
	{ id: ENV_EDITOR_PRESET_ID, label: "$EDITOR" },
	{ id: "code", label: "VS Code", commandLine: "code {file}" },
	{ id: "cursor", label: "Cursor", commandLine: "cursor {file}" },
	{ id: "zed", label: "Zed", commandLine: "zed {file}" },
	{ id: "windsurf", label: "Windsurf", commandLine: "windsurf {file}" },
	{ id: FREEFORM_PRESET_ID, label: "Freeform" }
]

const commentConfigFields = [
	{
		key: "editor",
		label: "Editor",
		description: "GUI editor used for /comment drafts and saved assistant messages.",
		kind: "enum",
		values: EDITOR_PRESET_IDS,
		default: ENV_EDITOR_PRESET_ID,
		valueDescriptions: Object.fromEntries(
			EDITOR_PRESETS.map(preset => [
				preset.id,
				preset.id === ENV_EDITOR_PRESET_ID
					? "Command from the EDITOR environment variable."
					: preset.commandLine
						? `Command: ${preset.commandLine}`
						: "Use the Freeform command."
			])
		)
	},
	{
		key: "freeformCommand",
		label: "Freeform command",
		description: "Shell command for the Freeform editor preset. Use {file}, or the file path is appended.",
		kind: "string",
		default: "",
		depth: 1,
		visibleWhen: ({ get }) => get("editor") === FREEFORM_PRESET_ID
	}
] as const satisfies readonly ScopedConfigField[]

type CommentConfig = ConfigFromFields<typeof commentConfigFields>
type ScopedCommentConfig = ScopedConfigPatch<CommentConfig>

const commentConfigSpec = defineCommentConfigSpec()

function defineCommentConfigSpec() {
	return defineScopedConfigSpec({
		fileName: CONFIG_FILE_NAME,
		scope: "user",
		fields: commentConfigFields
	})
}

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

function presetById(id: string | undefined): EditorPreset | undefined {
	return EDITOR_PRESETS.find(preset => preset.id === id)
}

function editorCommandLine(config: ResolvedConfig<CommentConfig>): string | undefined {
	const editor = commentConfigSpec.get(config, "editor")
	if (editor === ENV_EDITOR_PRESET_ID) return (process.env as { EDITOR?: string }).EDITOR?.trim() || undefined
	const preset = presetById(editor)
	if (!preset) return undefined
	if (preset.id === FREEFORM_PRESET_ID) {
		return commentConfigSpec.get(config, "freeformCommand").trim() || undefined
	}
	return preset.commandLine
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

function usageText(): string {
	return "Usage: /comment [sync [filename]] | save <filename> | settings"
}

function splitFirstWord(value: string): [string, string] {
	const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(value)
	return [match?.[1] ?? "", match?.[2]?.trim() ?? ""]
}

function stripOuterQuotes(value: string): string {
	if (value.length >= 2) {
		const first = value[0]
		const last = value.at(-1)
		if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
			return value.slice(1, -1)
		}
	}
	return value
}

function parseCommentArgs(args: string | undefined): ParsedCommentArgs {
	const trimmed = (args ?? "").trim()
	if (!trimmed) return { action: "sync" }

	const [command, rest] = splitFirstWord(trimmed)
	if (command === "settings" || command === "config") return { action: "settings" }
	if (command === "help" || command === "--help" || command === "-h") return { action: "help" }
	if (command === "sync") return rest ? { action: "sync", file: stripOuterQuotes(rest) } : { action: "sync" }
	if (command === "save") {
		if (!rest) return { action: "error", message: `/comment save requires a filename. ${usageText()}` }
		return { action: "save", file: stripOuterQuotes(rest) }
	}

	return { action: "error", message: `Unknown /comment mode "${command}". ${usageText()}` }
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

function loadCommandConfig(ctx: ExtensionContext): ScopedCommentConfig {
	const scoped: ScopedCommentConfig = { user: {}, workspace: {} }
	for (const scope of commentConfigSpec.scopes) {
		const path = commentConfigSpec.getPath(scope, ctx.cwd)
		try {
			scoped[scope] = commentConfigSpec.readFileOrEmpty(path)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			ctx.ui.notify(`Ignored unreadable Comment config: ${message}`, "warning")
		}
	}
	return scoped
}

async function showSettings(ctx: ExtensionCommandContext, config: ScopedConfigState<CommentConfig>): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("/comment settings requires interactive TUI mode", "error")
		return
	}

	const scoped = loadCommandConfig(ctx)
	config.setScoped(scoped)

	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) =>
			new ScopedConfigEditor({
				tui,
				theme,
				ctx,
				spec: commentConfigSpec,
				scoped,
				onChange(_resolved, scoped) {
					config.setScoped(scoped)
				},
				done
			})
	)
}

async function configuredEditorCommandLine(
	ctx: ExtensionCommandContext,
	config: ScopedConfigState<CommentConfig>
): Promise<string | undefined> {
	config.setScoped(loadCommandConfig(ctx))

	if (!editorCommandLine(config.getResolved())) {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("Configure an editor with /comment settings before using /comment.", "error")
			return undefined
		}

		ctx.ui.notify("No /comment editor configured. Opening /comment settings.", "warning")
		await showSettings(ctx, config)
	}

	const commandLine = editorCommandLine(config.getResolved())
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
	const config = new ScopedConfigState(commentConfigSpec)

	pi.registerCommand("comment", {
		description: "Comment on or save the last assistant message",
		handler: async (args, ctx) => {
			const parsed = parseCommentArgs(args)

			if (parsed.action === "settings") {
				await showSettings(ctx, config)
				return
			}
			if (parsed.action === "help") {
				ctx.ui.notify(usageText(), "info")
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
				const configuredCommandLine = await configuredEditorCommandLine(ctx, config)
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

			const configuredCommandLine = await configuredEditorCommandLine(ctx, config)
			if (!configuredCommandLine) return

			stopActive()

			const initialText = quoteText(text)
			let file: string
			let cleanupFile: boolean

			try {
				const draft = await createSyncDraft(ctx, initialText, parsed.file)
				file = draft.file
				cleanupFile = draft.cleanupFile
			} catch (error) {
				ctx.ui.notify(`Could not create comment draft: ${(error as Error).message}`, "error")
				return
			}

			const state: ActiveComment = {
				file,
				cleanupFile,
				ctx,
				lastText: initialText
			}

			active = state
			ctx.ui.setEditorText(initialText)
			ctx.ui.setStatus(STATUS_KEY, "💬")

			state.unsubscribeInput = ctx.ui.onTerminalInput(data => {
				if (active !== state) return undefined

				if (matchesKey(data, "escape")) {
					stopActive()
					ctx.ui.notify("Comment sync stopped", "info")
					return { consume: true }
				}

				if (matchesKey(data, "ctrl+c")) {
					ctx.ui.setEditorText("")
					stopActive()
					ctx.ui.notify("Comment sync stopped", "info")
					return { consume: true }
				}

				return undefined
			})

			const syncOnce = () => {
				if (active !== state) return

				try {
					const text = readFileSync(file, "utf8")
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

			state.watcher = watch(dirname(file), (_eventType, filename) => {
				if (filename == null || filename === basename(file)) syncOnce()
			})
			state.watcher.on("error", error => {
				if (active === state) {
					ctx.ui.notify(`comment sync stopped: ${error.message}`, "warning")
					stopActive()
				}
			})
			syncOnce()

			launchEditor(configuredCommandLine, file, message => {
				if (active !== state) return
				ctx.ui.notify(message, "error")
				stopActive()
			})

			ctx.ui.notify(`Comment draft opened: ${file} (Esc stops sync, Ctrl-C cancels)`, "info")
		}
	})

	pi.on("input", async event => {
		const state = active
		if (!state) {
			return { action: "continue" }
		}
		if (event.source !== "interactive") {
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
