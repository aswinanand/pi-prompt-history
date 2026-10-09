import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { KeyId, TUI } from "@earendil-works/pi-tui";
import { loadPromptHistoryConfig, type PromptHistoryConfig } from "./config.js";
import {
	appendPromptHistory,
	loadPromptHistory,
	loadPromptHistoryEntries,
	type PromptHistoryEntry,
} from "./history.js";
import { ReverseSearchComponent } from "./search.js";

const DEFAULT_COMMAND_NAME = "history";

export default async function promptHistoryExtension(pi: ExtensionAPI): Promise<void> {
	const registeredCommands = new Set<string>();
	const registeredShortcuts = new Set<string>();
	const registerHistoryCommand = (name: string) => {
		if (registeredCommands.has(name)) return;
		registeredCommands.add(name);
		pi.registerCommand(name, {
			description: "Browse prompt history and load an entry into the editor",
			handler: async (_args, ctx) => {
				await handleHistoryCommand(ctx);
			},
		});
	};
	const registerSearchShortcut = (shortcut: string) => {
		if (registeredShortcuts.has(shortcut)) return;
		registeredShortcuts.add(shortcut);
		pi.registerShortcut(shortcut as KeyId, {
			description: "Reverse search prompt history",
			handler: async (ctx) => {
				await handleSearchShortcut(ctx);
			},
		});
	};
	const registerConfiguredCommands = async (cwd: string) => {
		const { config } = await loadPromptHistoryConfig(cwd);
		if (!config.enabled) return;
		registerHistoryCommand(DEFAULT_COMMAND_NAME);
		registerHistoryCommand(config.command);
		registerSearchShortcut(config.searchShortcut);
	};

	pi.on("session_start", async (_event, ctx) => {
		try {
			await registerConfiguredCommands(ctx.cwd);
		} catch {
			// Command alias loading is best-effort; the input path reports no errors.
		}
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" as const };

		try {
			const { config } = await loadPromptHistoryConfig(ctx.cwd);
			if (!config.enabled) return { action: "continue" as const };
			const sessionDir = ctx.sessionManager.getSessionDir();
			if (!sessionDir) return { action: "continue" as const };
			await appendPromptHistory(sessionDir, config, event.text);
		} catch {
			// Prompt history must never block prompt submission. The command path reports
			// readable errors where UI feedback is useful; input capture stays fail-open.
		}

		return { action: "continue" as const };
	});
}

async function handleHistoryCommand(ctx: ExtensionCommandContext): Promise<void> {
	await ctx.waitForIdle();

	let config: PromptHistoryConfig;
	try {
		config = (await loadPromptHistoryConfig(ctx.cwd)).config;
	} catch (error) {
		ctx.ui.notify(`Failed to load prompt history settings: ${formatError(error)}`, "warning");
		return;
	}

	if (!config.enabled) {
		ctx.ui.notify("Prompt history is disabled", "warning");
		return;
	}

	const sessionDir = ctx.sessionManager.getSessionDir();
	if (!sessionDir) {
		ctx.ui.notify("Prompt history is unavailable without a persisted Pi session", "warning");
		return;
	}

	let entries: PromptHistoryEntry[];
	try {
		entries = await loadPromptHistoryEntries(sessionDir, config);
	} catch (error) {
		ctx.ui.notify(`Failed to load prompt history: ${formatError(error)}`, "error");
		return;
	}

	if (entries.length === 0) {
		ctx.ui.notify("No prompt history found", "info");
		return;
	}

	const digits = String(entries.length).length;
	const options = entries.map((entry, index) => {
		const number = String(index + 1).padStart(digits, "0");
		return `${number}  ${formatHistoryTimestamp(entry.createdAt)}  ${formatHistoryPreview(entry.text)}`;
	});
	const optionToEntry = new Map(options.map((option, index) => [option, entries[index]!]));
	const selected = await ctx.ui.select("Prompt History", options);
	if (!selected) return;

	const entry = optionToEntry.get(selected);
	if (!entry) {
		ctx.ui.notify("Could not resolve selected prompt history entry", "error");
		return;
	}

	ctx.ui.setEditorText(entry.text);
	ctx.ui.notify("Loaded prompt history entry into the editor", "info");
}

async function handleSearchShortcut(ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI) return;

	let config: PromptHistoryConfig;
	try {
		config = (await loadPromptHistoryConfig(ctx.cwd)).config;
	} catch (error) {
		ctx.ui.notify(`Failed to load prompt history settings: ${formatError(error)}`, "warning");
		return;
	}

	if (!config.enabled) return;

	const sessionDir = ctx.sessionManager.getSessionDir();
	if (!sessionDir) {
		ctx.ui.notify("Prompt history is unavailable without a persisted Pi session", "warning");
		return;
	}

	let texts: string[];
	try {
		texts = await loadPromptHistory(sessionDir, config);
	} catch (error) {
		ctx.ui.notify(`Failed to load prompt history: ${formatError(error)}`, "error");
		return;
	}

	if (texts.length === 0) {
		ctx.ui.notify("No prompt history found", "info");
		return;
	}

	let overlayTui: TUI | undefined;
	const selected = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
		overlayTui = tui;
		return new ReverseSearchComponent(tui, theme, texts, done, config.searchShortcut as KeyId);
	}, {
		overlay: true,
		overlayOptions: { anchor: "bottom-center", width: "100%" },
	});

	if (selected === null) return;

	ctx.ui.setEditorText(selected);
	ctx.ui.notify("Loaded prompt history entry into the editor", "info");
	// setEditorText does not repaint, and the render triggered by hiding the overlay
	// runs before this continuation (nextTick queue drains before promise microtasks).
	overlayTui?.requestRender();
}

function formatHistoryPreview(text: string, maxWidth = 72): string {
	const singleLine = text.replace(/\s+/g, " ").trim();
	return truncateText(singleLine || "(empty)", maxWidth);
}

function formatHistoryTimestamp(createdAt?: string): string {
	if (!createdAt) return "unknown time";
	const date = new Date(createdAt);
	if (Number.isNaN(date.getTime())) return createdAt;
	return date.toLocaleString();
}

function truncateText(text: string, maxLength: number): string {
	const chars = [...text];
	if (chars.length <= maxLength) return text;
	if (maxLength <= 1) return "…";
	return `${chars.slice(0, maxLength - 1).join("")}…`;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
