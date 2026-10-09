import assert from "node:assert/strict";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { collapseSkillExpansion, extractUserTexts, mergeUnique } from "./backfill.js";

function messageEntry(role: string, content: unknown): SessionEntry {
	return {
		type: "message",
		message: { role, content },
	} as unknown as SessionEntry;
}

const expanded =
	'<skill name="grill-me" location="/skills/grill-me/SKILL.md">\nbody text\n</skill>\n\nFind out about Ctrl+R.';

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
		messageEntry("user", expanded),
		messageEntry("assistant", "ignored"),
		messageEntry("user", [{ type: "image", data: "x" }]),
		messageEntry("user", "   "),
		messageEntry("user", []),
	]),
	["/skill:grill-me Find out about Ctrl+R."],
	"skips assistant messages, non-text blocks, and blank content; collapses skill expansion",
);

assert.deepEqual(extractUserTexts([{ type: "model_change" } as unknown as SessionEntry]), []);

// ─── collapseSkillExpansion ────────────────────────────────────────────────────

assert.equal(collapseSkillExpansion(expanded), "/skill:grill-me Find out about Ctrl+R.");
assert.equal(
	collapseSkillExpansion("plain prompt, no expansion"),
	"plain prompt, no expansion",
);
assert.equal(
	collapseSkillExpansion('<skill name="x" loc="y">\nbody\n</skill>'),
	"/skill:x",
	"wrapper without trailing content still collapses",
);

// ─── mergeUnique ───────────────────────────────────────────────────────────────

assert.deepEqual(mergeUnique(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
assert.deepEqual(mergeUnique([], ["x"]), ["x"]);
assert.deepEqual(mergeUnique(["same", "same"], []), ["same"], "duplicate input is collapsed");

console.log("prompt history backfill tests passed");
