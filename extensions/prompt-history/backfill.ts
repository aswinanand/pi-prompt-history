import { SessionManager, type SessionEntry } from "@earendil-works/pi-coding-agent";
import type { PromptHistoryConfig } from "./config.js";

/** Maximum number of recent session files scanned during backfill. */
const MAX_SESSIONS = 25;

/**
 * Extract user-authored text messages from session entries, in file order
 * (oldest first). Non-user entries, non-text content, and empty texts are skipped.
 */
export function extractUserTexts(entries: SessionEntry[]): string[] {
	const texts: string[] = [];
	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const message: unknown = entry.message;
		if (!isRecord(message) || message.role !== "user") continue;
		const text = extractText(message.content);
		if (text) texts.push(text);
	}
	return texts;
}

/**
 * Merge prompt lists newest-first, keeping the first occurrence of each text.
 * `primary` entries win over `secondary` entries at equal position.
 */
export function mergeUnique(primary: string[], secondary: string[]): string[] {
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const text of [...primary, ...secondary]) {
		if (seen.has(text)) continue;
		seen.add(text);
		merged.push(text);
	}
	return merged;
}

/**
 * Backfill the reverse-search index from existing Pi session files for `cwd`,
 * newest sessions first. Best-effort: unreadable sessions are skipped and any
 * listing failure yields an empty result. Returns at most `config.maxEntries`
 * unique texts, newest first, excluding any texts in `options.existing`.
 */
export async function loadBackfilledPrompts(
	cwd: string,
	config: PromptHistoryConfig,
	options: { existing?: string[] } = {},
): Promise<string[]> {
	let sessions;
	try {
		sessions = (await SessionManager.list(cwd)).sort(
			(a, b) => b.modified.getTime() - a.modified.getTime(),
		);
	} catch {
		return [];
	}

	const seen = new Set<string>();
	for (const text of options.existing ?? []) seen.add(text);

	const texts: string[] = [];
	const limit = Math.max(1, Math.floor(config.maxEntries));
	for (const session of sessions.slice(0, MAX_SESSIONS)) {
		if (texts.length >= limit) break;
		let entries: SessionEntry[];
		try {
			entries = SessionManager.open(session.path).getEntries();
		} catch {
			continue;
		}
		for (const text of extractUserTexts(entries).reverse()) {
			if (texts.length >= limit) break;
			if (seen.has(text)) continue;
			seen.add(text);
			texts.push(text);
		}
	}
	return texts;
}

function extractText(content: unknown): string | undefined {
	if (typeof content === "string") {
		return content.trim().length > 0 ? content : undefined;
	}
	if (!Array.isArray(content)) return undefined;
	const parts: string[] = [];
	for (const block of content) {
		if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
			parts.push(block.text);
		}
	}
	const text = parts.join("\n");
	return text.trim().length > 0 ? text : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
