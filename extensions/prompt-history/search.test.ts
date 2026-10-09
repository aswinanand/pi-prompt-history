import assert from "node:assert/strict";
import {
	bestSubsequenceSpan,
	collectMatchPositions,
	fuzzyMatch,
	rankMatches,
	scoreMatch,
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

// ─── scoreMatch / rankMatches ─────────────────────────────────────────────────

const contiguous = "fix the login bug";
const scattered = "leg omelette galore ink";
const midWord = "bloginfo";

assert.ok(
	scoreMatch(contiguous, "login") > scoreMatch(scattered, "login"),
	"contiguous substring scores higher than scattered subsequence",
);
assert.ok(
	scoreMatch("login issue", "login") > scoreMatch(midWord, "login"),
	"word-boundary match scores higher than mid-word match",
);
assert.equal(scoreMatch("anything", ""), 0);
assert.equal(scoreMatch("anything", "zzz"), 0, "non-matching token scores zero");

// Newest-first history: newer scattered match vs older contiguous match.
const history = [scattered, contiguous];
assert.deepEqual(
	rankMatches([0, 1], history, "login", "best"),
	[1, 0],
	"best order prefers the contiguous match despite lower recency",
);
assert.deepEqual(
	rankMatches([0, 1], history, "login", "recency"),
	[0, 1],
	"recency order keeps newest-first",
);
assert.deepEqual(
	rankMatches([0, 1], history, "", "best"),
	[0, 1],
	"empty query keeps recency order even in best mode",
);
// Equal scores tiebreak by recency (stable sort over newest-first input).
assert.deepEqual(
	rankMatches([0, 1], [contiguous, contiguous.slice()], "login", "best"),
	[0, 1],
);

console.log("prompt history search tests passed");
