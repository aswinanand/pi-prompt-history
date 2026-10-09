import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable, KeyId, TUI } from "@earendil-works/pi-tui";
import { Input, Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const DEFAULT_NEWER_SHORTCUT: KeyId = "ctrl+s";
const DEFAULT_SCROLL_UP_SHORTCUT: KeyId = "ctrl+k";
const DEFAULT_SCROLL_DOWN_SHORTCUT: KeyId = "ctrl+j";
/** Visible preview lines in the reverse-search viewport. */
const PREVIEW_LINES = 3;

// ─── Fuzzy Matching ────────────────────────────────────────────────────────────

/** Subsequence fuzzy match: all chars in needle appear in haystack in order. */
export function subsequence(haystack: string, needle: string): boolean {
	let hi = 0;
	for (let ni = 0; ni < needle.length; ni++) {
		const idx = haystack.indexOf(needle[ni]!, hi);
		if (idx === -1) return false;
		hi = idx + 1;
	}
	return true;
}

/** Space-separated tokens are each matched as subsequences, case-insensitively. */
export function fuzzyMatch(item: string, query: string): boolean {
	if (!query) return true;
	const lower = item.toLowerCase();
	const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
	return tokens.every((token) => subsequence(lower, token));
}

/** Find the indices matching `token` as a subsequence with the smallest spread. */
export function bestSubsequenceSpan(text: string, token: string): number[] {
	const positions: number[][] = [];
	for (const ch of token) {
		const idxs: number[] = [];
		for (let i = 0; i < text.length; i++) if (text[i] === ch) idxs.push(i);
		positions.push(idxs);
	}
	if (positions.some((arr) => arr.length === 0)) return [];

	const lowerBound = (arr: number[], min: number): number => {
		let lo = 0;
		let hi = arr.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (arr[mid]! < min) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	};

	let bestSpan = Infinity;
	let bestIdx: number[] = [];
	for (const c0 of positions[0]!) {
		const cur = [c0];
		let prev = c0;
		let ok = true;
		for (let t = 1; t < token.length; t++) {
			const arr = positions[t]!;
			const p = lowerBound(arr, prev + 1);
			if (p >= arr.length) {
				ok = false;
				break;
			}
			const nxt = arr[p]!;
			cur.push(nxt);
			prev = nxt;
		}
		if (!ok) continue;
		const span = cur[cur.length - 1]! - c0;
		if (span < bestSpan) {
			bestSpan = span;
			bestIdx = cur;
		}
	}
	return bestIdx;
}

/** Collect character indices (in `text`) matched by each query token (smallest-spread subsequence). */
export function collectMatchPositions(text: string, query: string): Set<number> {
	const positions = new Set<number>();
	if (!query) return positions;
	const lower = text.toLowerCase();
	const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
	for (const token of tokens) {
		const best = bestSubsequenceSpan(lower, token);
		for (const idx of best) positions.add(idx);
	}
	return positions;
}

// ─── Rendering Helpers ─────────────────────────────────────────────────────────

/** Underline + accent-highlight matched characters; plain text for the rest. */
function highlightSegments(text: string, positions: Set<number>, theme: Theme): string {
	let result = "";
	let i = 0;
	while (i < text.length) {
		if (positions.has(i)) {
			let j = i;
			while (j < text.length && positions.has(j)) j++;
			result += `\x1b[4m${theme.fg("accent", text.slice(i, j))}\x1b[24m`;
			i = j;
		} else {
			let j = i;
			while (j < text.length && !positions.has(j)) j++;
			result += theme.fg("text", text.slice(i, j));
			i = j;
		}
	}
	return result;
}

type WrappedLine = { text: string; start: number; end: number };

/** Soft-wrap `text` to `maxWidth` columns; `\n` forces a hard break; content is never truncated. */
function wrapText(text: string, maxWidth: number): WrappedLine[] {
	if (maxWidth <= 0) return [{ text: "", start: 0, end: 0 }];
	const lines: WrappedLine[] = [];
	let cur = "";
	let curW = 0;
	let curStart = 0;

	for (let idx = 0; idx < text.length; ) {
		const cp = text.codePointAt(idx)!;
		const ch = String.fromCodePoint(cp);
		if (ch === "\n") {
			lines.push({ text: cur, start: curStart, end: idx });
			cur = "";
			curW = 0;
			curStart = idx + 1;
			idx += 1;
			continue;
		}
		const w = visibleWidth(ch);
		if (curW + w > maxWidth && curW > 0) {
			lines.push({ text: cur, start: curStart, end: idx });
			cur = ch;
			curW = w;
			curStart = idx;
		} else {
			cur += ch;
			curW += w;
		}
		idx += ch.length;
	}
	if (curW > 0 || text.length === 0) {
		lines.push({ text: cur, start: curStart, end: text.length });
	} else if (text.endsWith("\n") && lines.length > 0) {
		lines.push({ text: "", start: text.length, end: text.length });
	}
	return lines;
}

/** Highlight the matched positions within one wrapped line. */
function renderWrappedLine(line: WrappedLine, matchPositions: Set<number>, theme: Theme): string {
	const local = new Set<number>();
	for (const p of matchPositions) {
		if (p >= line.start && p < line.end) local.add(p - line.start);
	}
	return local.size === 0 ? theme.fg("text", line.text) : highlightSegments(line.text, local, theme);
}

/** Render the viewport over wrapped lines; mark the first matched line with `▸`. */
function renderWrappedLines(
	lines: WrappedLine[],
	scroll: number,
	viewportLines: number,
	markIndex: number,
	matchPositions: Set<number>,
	theme: Theme,
): string[] {
	const out: string[] = [];
	for (let k = 0; k < viewportLines; k++) {
		const ln = lines[scroll + k];
		const text = ln ? renderWrappedLine(ln, matchPositions, theme) : "";
		const arrow = ln && scroll + k === markIndex ? "▸ " : "";
		out.push(arrow + text);
	}
	return out;
}

/** Wrap a (CRLF-normalized) record, locate the first matched line, and collect match positions. */
function buildWrappedMatch(
	record: string,
	query: string,
	maxWidth: number,
): { lines: WrappedLine[]; anchor: number; positions: Set<number> } {
	const normalized = record.replace(/\r\n/g, "\n");
	const lines = wrapText(normalized, maxWidth);
	const positions = collectMatchPositions(normalized, query);
	let anchor = 0;
	if (positions.size > 0) {
		const first = Math.min(...positions);
		for (let i = 0; i < lines.length; i++) {
			if (first >= lines[i]!.start && first < lines[i]!.end) {
				anchor = i;
				break;
			}
		}
	}
	return { lines, anchor, positions };
}

// ─── Reverse Search Overlay ────────────────────────────────────────────────────

export type ReverseSearchDone = (value: string | null) => void;

export class ReverseSearchComponent implements Component, Focusable {
	private _focused = false;
	private readonly input = new Input();

	private query = "";
	private matchIndices: number[] = [];
	private matchPointer = 0;
	private previewScroll = 0;
	private previewAutoLocate = true;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly history: string[],
		private readonly done: ReverseSearchDone,
		private readonly searchShortcut: KeyId = "ctrl+r",
	) {
		this.input.onEscape = () => this.done(null);
		this.input.onSubmit = () => {
			const match = this.getCurrentMatch();
			this.done(match ?? null);
		};
		this.recomputeMatches(true);
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	private recomputeMatches(resetPointer: boolean): void {
		const matches: number[] = [];
		for (let i = 0; i < this.history.length; i++) {
			if (fuzzyMatch(this.history[i]!, this.query)) {
				matches.push(i);
			}
		}
		this.matchIndices = matches;
		if (resetPointer) this.matchPointer = 0;
		if (this.matchPointer >= this.matchIndices.length) {
			this.matchPointer = Math.max(0, this.matchIndices.length - 1);
		}
		this.previewAutoLocate = true;
	}

	private getCurrentMatch(): string | undefined {
		if (this.matchIndices.length === 0) return undefined;
		const index = this.matchIndices[this.matchPointer];
		return this.history[index];
	}

	private cycleOlder(): void {
		if (this.matchIndices.length === 0) return;
		this.matchPointer = (this.matchPointer + 1) % this.matchIndices.length;
		this.previewAutoLocate = true;
	}

	private cycleNewer(): void {
		if (this.matchIndices.length === 0) return;
		this.matchPointer =
			(this.matchPointer - 1 + this.matchIndices.length) % this.matchIndices.length;
		this.previewAutoLocate = true;
	}

	handleInput(data: string): void {
		if (matchesKey(data, this.searchShortcut) || matchesKey(data, Key.up)) {
			this.cycleOlder();
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, DEFAULT_NEWER_SHORTCUT) || matchesKey(data, Key.down)) {
			this.cycleNewer();
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, Key.ctrl("g"))) {
			this.done(null);
			return;
		}

		if (matchesKey(data, DEFAULT_SCROLL_UP_SHORTCUT)) {
			this.previewAutoLocate = false;
			this.previewScroll = Math.max(0, this.previewScroll - 1);
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, DEFAULT_SCROLL_DOWN_SHORTCUT)) {
			this.previewAutoLocate = false;
			this.previewScroll += 1;
			this.tui.requestRender();
			return;
		}

		const before = this.input.getValue();
		this.input.handleInput(data);
		const after = this.input.getValue();

		if (after !== before) {
			this.query = after;
			this.recomputeMatches(true);
		}

		this.tui.requestRender();
	}

	render(width: number): string[] {
		const t = this.theme;
		const currentMatch = this.getCurrentMatch();

		const prefix = "(reverse-search) ";
		const maxCounterWidth = 10;
		const availableWidth = Math.max(10, width - prefix.length - maxCounterWidth);

		const counterText =
			this.matchIndices.length > 0
				? ` [${this.matchPointer + 1}/${this.matchIndices.length}]`
				: " [0/0]";
		const counter = t.fg("dim", counterText);

		const lines: string[] = [];
		if (currentMatch) {
			lines.push(t.fg("accent", prefix) + counter);
			const sep = t.fg("dim", "─".repeat(Math.max(1, width)));
			lines.push(sep);
			const { lines: wl, anchor, positions } = buildWrappedMatch(
				currentMatch,
				this.query,
				availableWidth,
			);
			const terminalRows = this.tui.terminal.rows;
			const maxVp = Math.max(PREVIEW_LINES, terminalRows - 6);
			const viewportLines = Math.max(PREVIEW_LINES, Math.min(wl.length, maxVp));
			const maxScroll = Math.max(0, wl.length - viewportLines);
			const scroll = this.previewAutoLocate
				? Math.min(maxScroll, Math.max(0, anchor - Math.floor(viewportLines / 2)))
				: Math.min(maxScroll, Math.max(0, this.previewScroll));
			this.previewScroll = scroll;
			lines.push(...renderWrappedLines(wl, scroll, viewportLines, anchor, positions, t));
			lines.push(sep);
		} else {
			lines.push(t.fg("accent", prefix) + t.fg("warning", "no match") + counter);
		}

		const inputLine = truncateToWidth(this.input.render(width)[0] ?? "", width);
		const help = truncateToWidth(
			t.fg(
				"dim",
				`${this.searchShortcut}/↑ older • ${DEFAULT_NEWER_SHORTCUT}/↓ newer • ${DEFAULT_SCROLL_UP_SHORTCUT}/${DEFAULT_SCROLL_DOWN_SHORTCUT} scroll • enter accept • esc cancel`,
			),
			width,
		);

		lines.push(inputLine, help);
		return lines.map((l) => truncateToWidth(l, width));
	}

	invalidate(): void {
		this.input.invalidate();
	}
}
