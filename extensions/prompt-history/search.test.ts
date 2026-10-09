import assert from "node:assert/strict";
import {
	bestSubsequenceSpan,
	collectMatchPositions,
	fuzzyMatch,
	subsequence,
} from "./search.js";

// ─── subsequence ───────────────────────────────────────────────────────────────

assert.equal(subsequence("input history", "ih"), true);
assert.equal(subsequence("input history", "hz"), false);
assert.equal(subsequence("", "a"), false);
assert.equal(subsequence("abc", ""), true);

// ─── fuzzyMatch ────────────────────────────────────────────────────────────────

assert.equal(fuzzyMatch("any query", ""), true, "empty query matches everything");
assert.equal(fuzzyMatch("Fix the login bug", "fxlogin"), true);
assert.equal(fuzzyMatch("Fix the login bug", "xz"), false);
assert.equal(
	fuzzyMatch("Fix the login bug", "fix bug"),
	true,
	"space-separated tokens each match as subsequences",
);
assert.equal(fuzzyMatch("Fix the login bug", "fix xyz"), false);
assert.equal(fuzzyMatch("UPPER CASE", "upper"), true, "matching is case-insensitive");

// ─── bestSubsequenceSpan ───────────────────────────────────────────────────────

assert.deepEqual(bestSubsequenceSpan("input", "in"), [0, 1]);
assert.deepEqual(
	bestSubsequenceSpan("pi input", "in"),
	[3, 4],
	"smallest-spread match wins over earlier loose subsequence",
);
assert.deepEqual(bestSubsequenceSpan("abc", "z"), [], "missing characters yield no span");

// ─── collectMatchPositions ─────────────────────────────────────────────────────

assert.deepEqual(collectMatchPositions("hello world", ""), new Set());
assert.deepEqual(collectMatchPositions("hello world", "h w"), new Set([0, 6]));
assert.deepEqual(
	[...collectMatchPositions("Hello", "h")].sort((a, b) => a - b),
	[0],
	"match positions are case-insensitive",
);

console.log("prompt history search tests passed");
