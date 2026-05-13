# Changelog

All notable changes to this repository are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added
- Initial standalone Pi prompt-history extension package.
- Session-directory JSONL prompt history at `prompt.history.jsonl`.
- `/history` command for loading prior prompts into Pi's native editor.
- `settings.json` configuration through `promptHistory` with legacy `editor.history` compatibility.
- Unit tests for config loading, storage behavior, and extension registration.
- npm publishing metadata for `@furbyhaxx/pi-prompt-history`.

### Changed
- Updated README installation guidance for GitHub, npm, and local checkout installs.
