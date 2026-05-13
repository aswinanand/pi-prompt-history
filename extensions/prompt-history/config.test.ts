import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_PROMPT_HISTORY_CONFIG,
	loadPromptHistoryConfig,
} from "./config.js";

async function withTempDirs(
	fn: (paths: { cwd: string; agentDir: string }) => Promise<void>,
): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "pi-prompt-history-config-"));
	try {
		await fn({ cwd: join(root, "project"), agentDir: join(root, "agent") });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

await withTempDirs(async ({ cwd, agentDir }) => {
	await mkdir(join(agentDir), { recursive: true });
	await mkdir(join(cwd, ".pi"), { recursive: true });
	await writeFile(
		join(agentDir, "settings.json"),
		JSON.stringify(
			{
				promptHistory: {
					maxEntries: 50,
					dedupe: "all",
					ignoreInvalidLines: false,
				},
			},
			null,
			2,
		),
		"utf8",
	);
	await writeFile(
		join(cwd, ".pi", "settings.json"),
		JSON.stringify(
			{
				promptHistory: {
					maxEntries: 5,
					trim: false,
				},
			},
			null,
			2,
		),
		"utf8",
	);

	const loaded = await loadPromptHistoryConfig(cwd, { agentDir });

	assert.deepEqual(loaded.config, {
		...DEFAULT_PROMPT_HISTORY_CONFIG,
		maxEntries: 5,
		dedupe: "all",
		trim: false,
		ignoreInvalidLines: false,
	});
	assert.deepEqual(loaded.sources, [
		join(agentDir, "settings.json"),
		join(cwd, ".pi", "settings.json"),
	]);
});

await withTempDirs(async ({ cwd, agentDir }) => {
	await mkdir(agentDir, { recursive: true });
	await writeFile(
		join(agentDir, "settings.json"),
		JSON.stringify({ editor: { history: { max_entries: 7, dedupe: "none" } } }),
		"utf8",
	);

	const loaded = await loadPromptHistoryConfig(cwd, { agentDir });

	assert.equal(loaded.config.maxEntries, 7);
	assert.equal(loaded.config.dedupe, "none");
});

await withTempDirs(async ({ cwd, agentDir }) => {
	await mkdir(agentDir, { recursive: true });
	await writeFile(
		join(agentDir, "settings.json"),
		JSON.stringify({
			editor: { history: { maxEntries: 7, dedupe: "none" } },
			promptHistory: { maxEntries: 3, dedupe: "consecutive" },
		}),
		"utf8",
	);

	const loaded = await loadPromptHistoryConfig(cwd, { agentDir });

	assert.equal(loaded.config.maxEntries, 3);
	assert.equal(loaded.config.dedupe, "consecutive");
});

await withTempDirs(async ({ cwd, agentDir }) => {
	await mkdir(agentDir, { recursive: true });
	await writeFile(
		join(agentDir, "settings.json"),
		JSON.stringify({ promptHistory: { enabled: "yes", maxEntries: -4, dedupe: "wat" } }),
		"utf8",
	);

	const loaded = await loadPromptHistoryConfig(cwd, { agentDir });

	assert.equal(loaded.config.enabled, DEFAULT_PROMPT_HISTORY_CONFIG.enabled);
	assert.equal(loaded.config.maxEntries, DEFAULT_PROMPT_HISTORY_CONFIG.maxEntries);
	assert.equal(loaded.config.dedupe, DEFAULT_PROMPT_HISTORY_CONFIG.dedupe);
});

await withTempDirs(async ({ cwd, agentDir }) => {
	await mkdir(agentDir, { recursive: true });
	await mkdir(join(cwd, ".pi"), { recursive: true });
	await writeFile(join(agentDir, "settings.json"), "{ invalid json ]", "utf8");
	await writeFile(
		join(cwd, ".pi", "settings.json"),
		JSON.stringify({ promptHistory: { maxEntries: 9 } }),
		"utf8",
	);

	const loaded = await loadPromptHistoryConfig(cwd, { agentDir });

	assert.equal(loaded.config.maxEntries, 9);
	assert.deepEqual(loaded.sources, [join(cwd, ".pi", "settings.json")]);
	assert.equal(loaded.errors.length, 1);
	assert.equal(loaded.errors[0]?.file, join(agentDir, "settings.json"));
});

console.log("prompt history config tests passed");
