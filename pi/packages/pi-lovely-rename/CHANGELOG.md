# Changelog

## [Unreleased]

### Fixed

- Give the naming model room to answer: the request runs at minimal reasoning with a 1024-token cap instead of the session's thinking level with a 64-token cap, which left reasoning models unable to emit a name.

## [0.1.3] - 2026-07-11

### Fixed

- The naming request follows the session's transport and WebSocket timeout settings.

## [0.1.2] - 2026-07-09

### Fixed

- The after-steps auto-rename trigger counts user-agent turns instead of every session entry.

## [0.1.1] - 2026-07-08

### Changed

- Improve the naming prompt.

## [0.1.0] - 2026-07-08

### Added

- Initial release: name sessions on demand with `/rename`, or automatically after a configurable number of turns or consumed tokens.
