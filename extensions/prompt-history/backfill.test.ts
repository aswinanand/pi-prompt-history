import assert from "node:assert/strict";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { extractUserTexts, mergeUnique } from "./backfill.js";

function messageEntry(role: string, content: unknown): SessionEntry {
	return {
		type: "message",
		message: { role, content },
	} as unknown as SessionEntry;
}

// ─── extractUserTexts ──────────────────────────────────────────────────────────

assert.deepEqual(
	extractUserTexts([
		messageEntry("user", "first prompt"),
		messageEntry("assistant", "response"),
		messageEntry("user", ["second", "prompt"].map((t) => ({ type: "text", text: t }))),
	]),
	["first prompt", "second\nprompt"],
	"extracts user messages in file order, string and text-block content",
);

assert.deepEqual(
	extractUserTexts([
		messageEntry("assistant", "ignored"),
		messageEntry("user", [{ type: "image", data: "x" }]),
		messageEntry("user", "   "),
		messageEntry("user", []),
	]),
	[],
	"skips assistant messages, non-text blocks, and blank content",
);

assert.deepEqual(extractUserTexts([{ type: "model_change" } as unknown as SessionEntry]), []);

// ─── mergeUnique ───────────────────────────────────────────────────────────────

assert.deepEqual(mergeUnique(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
assert.deepEqual(mergeUnique([], ["x"]), ["x"]);
assert.deepEqual(mergeUnique(["same", "same"], []), ["same"], "duplicate input is collapsed");

console.log("prompt history backfill tests passed");
