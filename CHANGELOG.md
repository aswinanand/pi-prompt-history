# Changelog

All notable changes to this repository are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Fuzzy reverse-search overlay bound to `Ctrl+R` (configurable via
  `promptHistory.searchShortcut` in `settings.json`), inspired by
  [`pi-input-history`](https://github.com/ouzhenkun/pi-input-history). Cycling
  with `Ctrl+R`/`↑` and `Ctrl+S`/`↓`, preview scrolling with `Ctrl+K`/`Ctrl+J`,
  accept with `Enter`, cancel with `Esc`/`Ctrl+G`.
- Search index backfill from recent Pi session files for the active working
  directory (up to `maxEntries` prompts, newest first), so prompts submitted
  before installation are searchable. Backfill is best-effort and asynchronous;
  `prompt.history.jsonl` storage remains session-scoped and untouched.
- Match-quality ordering for the overlay via `promptHistory.searchOrder`
  (`"best"` by default, `"recency"` to keep strict newest-first cycling).
  Best mode ranks contiguous, word-boundary matches above scattered
  subsequences, with recency as the stable tiebreak.
- Unit tests for match scoring and search-order config fallback.

## [0.1.1] - 2026-05-14

### Changed
- Register `/history` and configured aliases only when prompt history is enabled,
  after the active Pi session cwd is available.

### Added
- Extension tests covering disabled-command behavior and session-start command
  registration.

## [0.1.0] - 2026-05-14

### Added
- Initial standalone Pi prompt-history extension package.
- Session-directory JSONL prompt history at `prompt.history.jsonl`.
- `/history` command for loading prior prompts into Pi's native editor.
- `settings.json` configuration through `promptHistory` with legacy `editor.history` compatibility.
- Unit tests for config loading, storage behavior, and extension registration.
- npm publishing metadata for `@furbyhaxx/pi-prompt-history`.

### Changed
- Updated README installation guidance for GitHub, npm, and local checkout installs.
