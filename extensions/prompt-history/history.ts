import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PromptHistoryConfig, PromptHistoryDedupe } from "./config.js";

export interface PromptHistoryEntry {
	v: 1;
	createdAt?: string;
	text: string;
}

const writeQueues = new Map<string, Promise<void>>();

export function resolvePromptHistoryPath(sessionDir: string): string {
	return join(sessionDir, "prompt.history.jsonl");
}

export async function loadPromptHistoryEntries(
	sessionDir: string,
	config: PromptHistoryConfig,
): Promise<PromptHistoryEntry[]> {
	if (!config.enabled) return [];

	const path = resolvePromptHistoryPath(sessionDir);
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return [];
		throw error;
	}

	const entries: PromptHistoryEntry[] = [];
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed) as unknown;
			const entry = parsePromptHistoryEntry(parsed);
			if (entry) entries.push(entry);
		} catch (error) {
			if (config.ignoreInvalidLines) continue;
			throw error;
		}
	}

	return entries.reverse().slice(0, historyLimit(config));
}

export async function loadPromptHistory(
	sessionDir: string,
	config: PromptHistoryConfig,
): Promise<string[]> {
	const entries = await loadPromptHistoryEntries(sessionDir, config);
	return entries.map((entry) => entry.text);
}

export async function appendPromptHistory(
	sessionDir: string,
	config: PromptHistoryConfig,
	text: string,
): Promise<void> {
	if (!config.enabled) return;

	const path = resolvePromptHistoryPath(sessionDir);
	const previous = writeQueues.get(path) ?? Promise.resolve();
	const next = previous
		.catch(() => undefined)
		.then(() => appendPromptHistoryUnlocked(sessionDir, config, text));
	const queued = next.finally(() => {
		if (writeQueues.get(path) === queued) writeQueues.delete(path);
	});
	writeQueues.set(path, queued);
	return next;
}

async function appendPromptHistoryUnlocked(
	sessionDir: string,
	config: PromptHistoryConfig,
	text: string,
): Promise<void> {
	const normalized = normalizePrompt(text, config);
	if (!normalized) return;

	let current: PromptHistoryEntry[];
	try {
		current = await loadPromptHistoryEntries(sessionDir, config);
	} catch {
		if (!config.ignoreInvalidLines) {
			throw new Error("Failed to load prompt history.");
		}
		current = [];
	}

	const dedupe = normalizeDedupe(config.dedupe);
	if (dedupe === "consecutive" && current[0]?.text === normalized) return;
	if (dedupe === "all") {
		current = current.filter((entry) => entry.text !== normalized);
	}

	const next = [createPromptHistoryEntry(normalized), ...current].slice(
		0,
		historyLimit(config),
	);
	await writePromptHistory(sessionDir, next);
}

async function writePromptHistory(
	sessionDir: string,
	newestFirst: PromptHistoryEntry[],
): Promise<void> {
	const path = resolvePromptHistoryPath(sessionDir);
	await mkdir(dirname(path), { recursive: true });

	const lines = newestFirst
		.map(sanitizePromptHistoryEntry)
		.reverse()
		.map((entry) => JSON.stringify(entry));

	await writeFile(path, `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`, "utf8");
}

function parsePromptHistoryEntry(value: unknown): PromptHistoryEntry | undefined {
	if (!value || typeof value !== "object") return undefined;
	const text = (value as { text?: unknown }).text;
	if (typeof text !== "string" || text.trim().length === 0) return undefined;
	const createdAt = (value as { createdAt?: unknown }).createdAt;
	return {
		v: 1,
		createdAt:
			typeof createdAt === "string" && createdAt.trim().length > 0
				? createdAt
				: undefined,
		text,
	};
}

function normalizePrompt(text: string, config: PromptHistoryConfig): string {
	const normalized = config.trim === false ? text : text.trim();
	return normalized.trim().length > 0 ? normalized : "";
}

function normalizeDedupe(value: PromptHistoryDedupe): PromptHistoryDedupe {
	return value === "all" || value === "none" ? value : "consecutive";
}

function historyLimit(config: PromptHistoryConfig): number {
	const value = Number(config.maxEntries);
	return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 200;
}

function createPromptHistoryEntry(text: string): PromptHistoryEntry {
	return { v: 1, createdAt: new Date().toISOString(), text };
}

function sanitizePromptHistoryEntry(entry: PromptHistoryEntry): PromptHistoryEntry {
	return {
		v: 1,
		createdAt:
			typeof entry.createdAt === "string" && entry.createdAt.trim().length > 0
				? entry.createdAt
				: new Date().toISOString(),
		text: entry.text,
	};
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
