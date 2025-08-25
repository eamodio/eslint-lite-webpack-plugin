# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

## [0.3.2] - 2025-08-25

### Fixed

- Fixes CI issues

## [0.3.0] - 2025-08-25

### Added

- Adds support `concurrency` ESLint option to use instead of `worker` (`worker` should be set to `false` when using `concurrency`)

## [0.2.0] - 2024-12-11

### Added

- Adds new `reportingRoot` option to specify the root for relative paths in error reporting

### Changed

- Changes default root path used for relative paths in error reporting to be the cwd of the process

## [0.1.0] - 2024-09-18

### Changed

- BREAKING CHANGE: Upgrades to support eslint 9, which uses flat configuration files

## [0.0.8] - 2023-12-01

## [0.0.7] - 2023-12-01

### Changed

- Changes back to using the cache (when specified) for rebuilds in watch mode

## [0.0.6] - 2023-12-01

### Changed

- Changes watch output to always output all errors and warnings
- Changes to use `fast-glob` instead of `glob` to improve performance

### Fixed

- Fixes issue where workers weren't reporting errors or warnings

## [0.0.5] - 2023-12-01

## [0.0.4] - 2023-12-01

## [0.0.3] - 2023-12-01

## [0.0.2] - 2023-12-01

### Changed

- Avoids bundling `node_modules` and avoids minification

## [0.0.1] - 2023-11-30

### Added

- Initial release

[unreleased]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.3.1...eamodio:v0.3.2
[0.3.1]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.3.0...eamodio:v0.3.1
[0.3.0]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.2.0...eamodio:v0.3.0
[0.2.0]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.1.0...eamodio:v0.2.0
[0.1.0]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.0.8...eamodio:v0.1.0
[0.0.8]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.0.7...eamodio:v0.0.8
[0.0.7]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.0.6...eamodio:v0.0.7
[0.0.6]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.0.5...eamodio:v0.0.6
[0.0.5]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.0.4...eamodio:v0.0.5
[0.0.4]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.0.3...eamodio:v0.0.4
[0.0.3]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.0.2...eamodio:v0.0.3
[0.0.2]: https://github.com/eamodio/eslint-lite-webpack-plugin/compare/v0.0.1...eamodio:v0.0.2
