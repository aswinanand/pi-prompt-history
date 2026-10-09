import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type PromptHistoryDedupe = "none" | "consecutive" | "all";
export type PromptHistorySearchOrder = "best" | "recency";

export interface PromptHistoryConfig {
	enabled: boolean;
	maxEntries: number;
	dedupe: PromptHistoryDedupe;
	trim: boolean;
	ignoreInvalidLines: boolean;
	command: string;
	searchShortcut: string;
	searchOrder: PromptHistorySearchOrder;
}

export interface PromptHistoryConfigError {
	file: string;
	error: Error;
}

export interface LoadedPromptHistoryConfig {
	config: PromptHistoryConfig;
	sources: string[];
	errors: PromptHistoryConfigError[];
}

export interface LoadPromptHistoryConfigOptions {
	agentDir?: string;
}

export const DEFAULT_PROMPT_HISTORY_CONFIG: PromptHistoryConfig = {
	enabled: true,
	maxEntries: 200,
	dedupe: "consecutive",
	trim: true,
	ignoreInvalidLines: true,
	command: "history",
	searchShortcut: "ctrl+r",
	searchOrder: "best",
};

type JsonObject = Record<string, unknown>;
type PartialPromptHistoryConfig = Partial<PromptHistoryConfig>;

export async function loadPromptHistoryConfig(
	cwd: string,
	options: LoadPromptHistoryConfigOptions = {},
): Promise<LoadedPromptHistoryConfig> {
	const agentDir = options.agentDir ?? getAgentDir();
	const files = [
		join(agentDir, "settings.json"),
		join(cwd, ".pi", "settings.json"),
	];

	let merged: PartialPromptHistoryConfig = { ...DEFAULT_PROMPT_HISTORY_CONFIG };
	const sources: string[] = [];
	const errors: PromptHistoryConfigError[] = [];

	for (const file of files) {
		let settings: JsonObject | undefined;
		try {
			settings = await readSettingsJson(file);
		} catch (error) {
			errors.push({
				file,
				error: error instanceof Error ? error : new Error(String(error)),
			});
			continue;
		}
		if (!settings) continue;
		const partial = extractPromptHistoryConfig(settings);
		if (!partial) continue;
		merged = deepMerge(merged, partial);
		sources.push(file);
	}

	return {
		config: sanitizePromptHistoryConfig(merged),
		sources,
		errors,
	};
}

async function readSettingsJson(file: string): Promise<JsonObject | undefined> {
	let content: string;
	try {
		content = await readFile(file, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return undefined;
		throw error;
	}

	const parsed = JSON.parse(content) as unknown;
	if (!isPlainObject(parsed)) {
		throw new Error(`Pi settings file ${file} must contain a JSON object.`);
	}
	return normalizeConfigAliases(parsed) as JsonObject;
}

function extractPromptHistoryConfig(
	settings: JsonObject,
): PartialPromptHistoryConfig | undefined {
	const legacy = extractLegacyEditorHistory(settings);
	const current = extractCurrentPromptHistory(settings);

	if (legacy && current) return deepMerge(legacy, current);
	return current ?? legacy;
}

function extractCurrentPromptHistory(
	settings: JsonObject,
): PartialPromptHistoryConfig | undefined {
	const value = settings.promptHistory;
	if (!isPlainObject(value)) return undefined;

	if (isPlainObject(value.history)) {
		return deepMerge(value as PartialPromptHistoryConfig, value.history as PartialPromptHistoryConfig);
	}
	return value as PartialPromptHistoryConfig;
}

function extractLegacyEditorHistory(
	settings: JsonObject,
): PartialPromptHistoryConfig | undefined {
	const editor = settings.editor;
	if (!isPlainObject(editor)) return undefined;
	const history = editor.history;
	if (!isPlainObject(history)) return undefined;
	return history as PartialPromptHistoryConfig;
}

function sanitizePromptHistoryConfig(
	value: PartialPromptHistoryConfig,
): PromptHistoryConfig {
	return {
		enabled:
			typeof value.enabled === "boolean"
				? value.enabled
				: DEFAULT_PROMPT_HISTORY_CONFIG.enabled,
		maxEntries: sanitizeMaxEntries(value.maxEntries),
		dedupe: isPromptHistoryDedupe(value.dedupe)
			? value.dedupe
			: DEFAULT_PROMPT_HISTORY_CONFIG.dedupe,
		trim:
			typeof value.trim === "boolean"
				? value.trim
				: DEFAULT_PROMPT_HISTORY_CONFIG.trim,
		ignoreInvalidLines:
			typeof value.ignoreInvalidLines === "boolean"
				? value.ignoreInvalidLines
				: DEFAULT_PROMPT_HISTORY_CONFIG.ignoreInvalidLines,
		command:
			typeof value.command === "string" && value.command.trim().length > 0
				? normalizeCommandName(value.command)
				: DEFAULT_PROMPT_HISTORY_CONFIG.command,
		searchShortcut:
			typeof value.searchShortcut === "string" && value.searchShortcut.trim().length > 0
				? normalizeShortcut(value.searchShortcut)
				: DEFAULT_PROMPT_HISTORY_CONFIG.searchShortcut,
		searchOrder: isPromptHistorySearchOrder(value.searchOrder)
			? value.searchOrder
			: DEFAULT_PROMPT_HISTORY_CONFIG.searchOrder,
	};
}

function sanitizeMaxEntries(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_PROMPT_HISTORY_CONFIG.maxEntries;
	}
	const integer = Math.floor(value);
	return integer > 0 ? integer : DEFAULT_PROMPT_HISTORY_CONFIG.maxEntries;
}

function normalizeShortcut(shortcut: string): string {
	return shortcut.trim().toLowerCase() || DEFAULT_PROMPT_HISTORY_CONFIG.searchShortcut;
}

function normalizeCommandName(command: string): string {
	return command.trim().replace(/^\/+/, "") || DEFAULT_PROMPT_HISTORY_CONFIG.command;
}

function isPromptHistoryDedupe(value: unknown): value is PromptHistoryDedupe {
	return value === "none" || value === "consecutive" || value === "all";
}

function isPromptHistorySearchOrder(value: unknown): value is PromptHistorySearchOrder {
	return value === "best" || value === "recency";
}

function normalizeConfigAliases(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((item) => normalizeConfigAliases(item));
	if (!isPlainObject(value)) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			snakeToCamel(key),
			normalizeConfigAliases(item),
		]),
	);
}

function snakeToCamel(key: string): string {
	return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function deepMerge<T extends JsonObject>(base: T, override: JsonObject): T {
	const result: JsonObject = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (value === undefined) continue;
		const current = result[key];
		if (isPlainObject(current) && isPlainObject(value)) {
			result[key] = deepMerge(current, value);
		} else {
			result[key] = clone(value);
		}
	}
	return result as T;
}

function clone<T>(value: T): T {
	if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
	if (isPlainObject(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, clone(item)]),
		) as T;
	}
	return value;
}

function isPlainObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
