import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { PromptHistoryConfig } from "./config.js";
import {
	appendPromptHistory,
	loadPromptHistory,
	loadPromptHistoryEntries,
	resolvePromptHistoryPath,
} from "./history.js";

async function withSessionDir(fn: (sessionDir: string) => Promise<void>): Promise<void> {
	const sessionDir = await mkdtemp(join(tmpdir(), "pi-prompt-history-session-"));
	try {
		await fn(sessionDir);
	} finally {
		await rm(sessionDir, { recursive: true, force: true });
	}
}

const baseConfig: PromptHistoryConfig = {
	enabled: true,
	maxEntries: 10,
	dedupe: "consecutive",
	trim: true,
	ignoreInvalidLines: false,
	command: "history",
};

await withSessionDir(async (sessionDir) => {
	assert.equal(resolvePromptHistoryPath(sessionDir), join(sessionDir, "prompt.history.jsonl"));
});

await withSessionDir(async (sessionDir) => {
	const path = resolvePromptHistoryPath(sessionDir);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		[
			JSON.stringify({ v: 1, createdAt: "2026-05-04T10:00:00.000Z", text: "older" }),
			JSON.stringify({ v: 1, createdAt: "2026-05-04T11:00:00.000Z", text: "newer" }),
		].join("\n") + "\n",
		"utf8",
	);

	assert.deepEqual(await loadPromptHistory(sessionDir, baseConfig), ["newer", "older"]);
	assert.deepEqual(await loadPromptHistoryEntries(sessionDir, baseConfig), [
		{ v: 1, createdAt: "2026-05-04T11:00:00.000Z", text: "newer" },
		{ v: 1, createdAt: "2026-05-04T10:00:00.000Z", text: "older" },
	]);

	await appendPromptHistory(sessionDir, baseConfig, " latest ");
	const rewritten = (await readFile(path, "utf8"))
		.trim()
		.split(/\r?\n/)
		.map((line) => JSON.parse(line) as { createdAt?: string; text: string });

	assert.deepEqual(rewritten.map((entry) => entry.text), ["older", "newer", "latest"]);
	assert.equal(rewritten[0]?.createdAt, "2026-05-04T10:00:00.000Z");
	assert.equal(rewritten[1]?.createdAt, "2026-05-04T11:00:00.000Z");
	assert.match(rewritten[2]?.createdAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
});

await withSessionDir(async (sessionDir) => {
	await appendPromptHistory(sessionDir, baseConfig, "same");
	await appendPromptHistory(sessionDir, baseConfig, "same");
	assert.deepEqual(await loadPromptHistory(sessionDir, baseConfig), ["same"]);
});

await withSessionDir(async (sessionDir) => {
	const allDedupe = { ...baseConfig, dedupe: "all" as const };
	await appendPromptHistory(sessionDir, allDedupe, "alpha");
	await appendPromptHistory(sessionDir, allDedupe, "beta");
	await appendPromptHistory(sessionDir, allDedupe, "alpha");
	assert.deepEqual(await loadPromptHistory(sessionDir, allDedupe), ["alpha", "beta"]);
});

await withSessionDir(async (sessionDir) => {
	const capped = { ...baseConfig, maxEntries: 2 };
	await appendPromptHistory(sessionDir, capped, "one");
	await appendPromptHistory(sessionDir, capped, "two");
	await appendPromptHistory(sessionDir, capped, "three");
	assert.deepEqual(await loadPromptHistory(sessionDir, capped), ["three", "two"]);
});

await withSessionDir(async (sessionDir) => {
	const path = resolvePromptHistoryPath(sessionDir);
	await writeFile(path, "{not-json}\n", "utf8");
	await assert.rejects(() => loadPromptHistoryEntries(sessionDir, baseConfig));
	assert.deepEqual(
		await loadPromptHistoryEntries(sessionDir, { ...baseConfig, ignoreInvalidLines: true }),
		[],
	);
});

await withSessionDir(async (sessionDir) => {
	await appendPromptHistory(sessionDir, { ...baseConfig, enabled: false }, "ignored");
	assert.deepEqual(await loadPromptHistory(sessionDir, baseConfig), []);
});

console.log("prompt history storage tests passed");
