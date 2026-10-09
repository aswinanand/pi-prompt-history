# pi-prompt-history

A slim [pi](https://github.com/earendil-works/pi) coding agent extension that keeps session-scoped prompt history and lets you load previous prompts back into pi's native editor.

It provides prompt recall with:

- **Session-local storage** — prompts are written next to the active pi session as `prompt.history.jsonl`.
- **Native editor integration** — `/history` loads a selected prompt via pi's built-in editor API.
- **Reverse search** — `Ctrl+R` opens a fuzzy reverse-search overlay over stored prompts, inspired by [`pi-input-history`](https://github.com/ouzhenkun/pi-input-history).
- **No custom theme or editor** — pi's active theme and default editor stay in charge, as nature briefly intended.
- **Regular pi settings** — configuration uses global/project `settings.json`; no `Pi.yaml`.

Project repository: <https://github.com/furbyhaxx/pi-prompt-history>

## Install

Install from GitHub:

```sh
pi install git:https://github.com/furbyhaxx/pi-prompt-history
```

Install from npm:

```sh
pi install npm:@furbyhaxx/pi-prompt-history
```

Or clone the repo and install from the local checkout:

```sh
git clone https://github.com/furbyhaxx/pi-prompt-history
pi install path/to/cloned/repo
```

Or load directly without installing:

```sh
pi -e path/to/cloned/repo/extensions/prompt-history/index.ts
```

## What it does

- Captures raw submitted prompt text via Pi's `input` event before skill/template expansion.
- Stores history as JSONL in the current Pi session directory:

  ```text
  ${PI_CODING_AGENT_DIR:-~/.pi/agent}/sessions/{session-cwd-sanitized}/prompt.history.jsonl
  ```

- Adds `/history` to browse stored prompts and load one back into the native Pi editor.
- Adds a reverse-search shortcut (default `Ctrl+R`) that opens an overlay to fuzzy-filter stored prompts and load the selected match into the editor.
- Skips extension-injected messages so helper extensions do not pollute user prompt history.
- Supports global and project config through Pi's normal `settings.json` files.

## Configuration

Global settings live at:

```text
${PI_CODING_AGENT_DIR:-~/.pi/agent}/settings.json
```

Project settings live at:

```text
.pi/settings.json
```

Example:

```json
{
  "promptHistory": {
    "enabled": true,
    "maxEntries": 200,
    "dedupe": "consecutive",
    "trim": true,
    "ignoreInvalidLines": true,
    "command": "history",
    "searchShortcut": "ctrl+r"
  }
}
```

Options:

| Key | Default | Description |
|---|---:|---|
| `enabled` | `true` | Enable prompt capture and `/history`. |
| `maxEntries` | `200` | Maximum entries retained in `prompt.history.jsonl`. |
| `dedupe` | `"consecutive"` | `"none"`, `"consecutive"`, or `"all"`. |
| `trim` | `true` | Trim submitted prompts before storing. |
| `ignoreInvalidLines` | `true` | Ignore malformed JSONL lines instead of failing. |
| `command` | `"history"` | Optional extra command alias registered after session start. |
| `searchShortcut` | `"ctrl+r"` | Shortcut that opens the fuzzy reverse-search overlay. |

### Reverse search keys

While the overlay is open:

| Key | Action |
|---|---|
| `Ctrl+R` (search shortcut) / `↑` | Cycle to older match |
| `Ctrl+S` / `↓` | Cycle to newer match |
| `Ctrl+K` / `Ctrl+J` | Scroll the preview viewport |
| `Enter` | Accept match into the editor |
| `Esc` / `Ctrl+G` | Cancel |

Matching is a case-insensitive subsequence match per space-separated token, and matched characters are highlighted in the preview.

For compatibility with the extracted source layout, this package also reads `editor.history` from `settings.json`; `promptHistory` wins when both are present.

## Build and validation

No build artifacts are produced; pi loads the `.ts` source directly via `jiti`.

```sh
npm install
npm run test
```

`npm run test` runs TypeScript typechecking and unit tests for config loading, JSONL storage, and extension registration behavior.

## License

MIT
