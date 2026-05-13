import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import promptHistoryExtension from "./index.js";
import { resolvePromptHistoryPath } from "./history.js";

type InputHandler = (event: { text: string; source: "interactive" | "rpc" | "extension" }, ctx: MockCtx) => Promise<unknown> | unknown;
type CommandHandler = (args: string, ctx: MockCtx) => Promise<void> | void;

interface MockCtx {
	cwd: string;
	hasUI: boolean;
	sessionManager: {
		getSessionDir(): string;
	};
	ui: {
		selected?: string;
		selectCalls: Array<{ title: string; options: string[] }>;
		setEditorTextCalls: string[];
		notifications: Array<{ text: string; level: string }>;
		select(title: string, options: string[]): Promise<string | undefined>;
		setEditorText(text: string): void;
		notify(text: string, level: string): void;
		setEditorComponent(): never;
		setFooter(): never;
		setTheme(): never;
	};
	waitForIdleCalls: number;
	waitForIdle(): Promise<void>;
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function createMockCtx(cwd: string, sessionDir: string): MockCtx {
	const ctx: MockCtx = {
		cwd,
		hasUI: true,
		sessionManager: { getSessionDir: () => sessionDir },
		ui: {
			selectCalls: [],
			setEditorTextCalls: [],
			notifications: [],
			async select(title, options) {
				this.selectCalls.push({ title, options });
				return this.selected ?? options[0];
			},
			setEditorText(text) {
				this.setEditorTextCalls.push(text);
			},
			notify(text, level) {
				this.notifications.push({ text, level });
			},
			setEditorComponent() {
				throw new Error("custom editor must not be registered");
			},
			setFooter() {
				throw new Error("custom footer must not be registered");
			},
			setTheme() {
				throw new Error("custom theme must not be registered");
			},
		},
		waitForIdleCalls: 0,
		async waitForIdle() {
			this.waitForIdleCalls += 1;
		},
	};
	return ctx;
}

async function withTempRuntime(fn: (paths: { cwd: string; sessionDir: string; agentDir: string }) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "pi-prompt-history-extension-"));
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	try {
		const paths = {
			cwd: join(root, "project"),
			sessionDir: join(root, "agent", "sessions", "--project--"),
			agentDir: join(root, "agent"),
		};
		await mkdir(paths.cwd, { recursive: true });
		await fn(paths);
	} finally {
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		await rm(root, { recursive: true, force: true });
	}
}

await withTempRuntime(async ({ cwd, sessionDir }) => {
	const handlers = new Map<string, InputHandler>();
	const commands = new Map<string, { description: string; handler: CommandHandler }>();
	const pi = {
		on(name: string, handler: InputHandler) {
			handlers.set(name, handler);
		},
		registerCommand(name: string, command: { description: string; handler: CommandHandler }) {
			commands.set(name, command);
		},
	};

	promptHistoryExtension(pi as never);

	assert.ok(handlers.has("input"));
	assert.ok(commands.has("history"));

	const ctx = createMockCtx(cwd, sessionDir);
	const input = handlers.get("input")!;
	assert.deepEqual(await input({ text: " first prompt ", source: "interactive" }, ctx), { action: "continue" });
	assert.deepEqual(await input({ text: "ignored extension prompt", source: "extension" }, ctx), { action: "continue" });

	const historyPath = resolvePromptHistoryPath(sessionDir);
	const lines = (await readFile(historyPath, "utf8")).trim().split(/\r?\n/);
	assert.equal(lines.length, 1);
	assert.equal((JSON.parse(lines[0]!) as { text: string }).text, "first prompt");

	await input({ text: "second prompt", source: "rpc" }, ctx);
	await commands.get("history")!.handler("", ctx);

	assert.equal(ctx.waitForIdleCalls, 1);
	assert.equal(ctx.ui.selectCalls.length, 1);
	assert.equal(ctx.ui.selectCalls[0]?.title, "Prompt History");
	assert.equal(ctx.ui.setEditorTextCalls[0], "second prompt");
	assert.deepEqual(ctx.ui.notifications.at(-1), {
		text: "Loaded prompt history entry into the editor",
		level: "info",
	});
});

await withTempRuntime(async ({ cwd }) => {
	const handlers = new Map<string, InputHandler>();
	const pi = {
		on(name: string, handler: InputHandler) {
			handlers.set(name, handler);
		},
		registerCommand() {},
	};
	promptHistoryExtension(pi as never);

	const oldCwd = process.cwd();
	process.chdir(cwd);
	try {
		await handlers.get("input")!({ text: "ephemeral", source: "interactive" }, createMockCtx(cwd, ""));
		assert.equal(await fileExists(join(cwd, "prompt.history.jsonl")), false);
	} finally {
		process.chdir(oldCwd);
	}
});

console.log("prompt history extension tests passed");
