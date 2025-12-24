# eslint-lite-webpack-plugin

A lightweight, high-performance ESLint plugin for Webpack with worker thread support.

## Features

- ⚡ **Fast file discovery** using [tinyglobby](https://github.com/SuperchupuDev/tinyglobby) (3-5x faster than alternatives)
- 🚀 **Fast pattern matching** using [picomatch](https://github.com/micromatch/picomatch) (7-29x faster than minimatch)
- 🔧 **Worker thread support** for parallel linting of large codebases
- 📦 **Minimal dependencies** - only 2 runtime dependencies
- 🎯 **Smart caching** in watch mode for optimal rebuild performance
- 🔍 **Flexible file filtering** with include and exclude patterns

## Installation

You'll first need to install [ESLint](http://eslint.org):

```bash
npm i eslint --save-dev
```

Next, install `eslint-lite-webpack-plugin`:

```bash
npm install @eamodio/eslint-lite-webpack-plugin --save-dev
```

## Usage

### Basic Usage

Add the plugin to your `webpack.config.js`:

```js
const { ESLintLitePlugin } = require('@eamodio/eslint-lite-webpack-plugin');

module.exports = {
	// ...
	plugins: [
		new ESLintLitePlugin({
			files: 'src/**/*.{ts,tsx,js,jsx}',
		}),
	],
	// ...
};
```

### Advanced Configuration

```js
const { ESLintLitePlugin } = require('@eamodio/eslint-lite-webpack-plugin');

module.exports = {
	// ...
	plugins: [
		new ESLintLitePlugin({
			// Required: Glob pattern(s) for files to lint
			files: 'src/**/*.{ts,tsx,js,jsx}',

			// Optional: Exclude patterns (can be string or array)
			exclude: ['**/*.test.ts', '**/*.spec.ts', '**/fixtures/**', '**/__mocks__/**'],

			// Optional: ESLint options
			eslintOptions: {
				cache: true,
				cacheLocation: '.eslintcache',
				cacheStrategy: 'content',
			},

			// Optional: Worker configuration
			// - true: Enable workers (default)
			// - false: Disable workers
			// - object: Configure worker behavior
			worker: {
				max: 4, // Maximum number of workers
				filesPerWorker: 500, // Files per worker (default: 500)
			},

			// Optional: Root path for error reporting
			reportingRoot: process.cwd(),
		}),
	],
	// ...
};
```

## Options

### `files` (required)

**Type:** `string`

Glob pattern for files to lint. Uses [tinyglobby](https://github.com/SuperchupuDev/tinyglobby) for fast file discovery.

```js
files: 'src/**/*.{ts,tsx,js,jsx}';
```

### `exclude` (optional)

**Type:** `string | string[]`

Pattern(s) to exclude from linting. Supports both glob patterns and picomatch patterns.

```js
// Single pattern
exclude: '**/*.test.ts';

// Multiple patterns
exclude: ['**/*.test.ts', '**/*.spec.ts', '**/fixtures/**'];
```

**Note:** `node_modules` is always excluded automatically.

### `eslintOptions` (optional)

**Type:** `object`

ESLint configuration options. Supports a subset of [ESLint options](https://eslint.org/docs/latest/integrate/nodejs-api#-new-eslintoptions):

- `cache` - Enable/disable caching
- `cacheLocation` - Path to cache file
- `cacheStrategy` - Cache strategy (`'metadata'` or `'content'`)
- `concurrency` - Number of files to process concurrently (use with `worker: false`)
- `overrideConfigFile` - Path to ESLint config file

```js
eslintOptions: {
  cache: true,
  cacheLocation: '.eslintcache',
  cacheStrategy: 'content'
}
```

### `worker` (optional)

**Type:** `boolean | { max: number; filesPerWorker?: number }`
**Default:** `true`

Configure worker thread behavior for parallel linting.

```js
// Enable workers (default)
worker: true

// Disable workers
worker: false

// Configure workers
worker: {
  max: 4,              // Maximum number of workers
  filesPerWorker: 500  // Files per worker (default: 500)
}
```

**Note:** Workers are automatically used when linting more than 50 files. For smaller projects, consider using `worker: false` with ESLint's `concurrency` option instead.

### `reportingRoot` (optional)

**Type:** `string`
**Default:** `process.cwd()`

Root path for relative file paths in error reporting.

```js
reportingRoot: '/path/to/project';
```

## Performance

This plugin is optimized for performance:

- **Initial builds:** 20-40% faster than alternatives using tinyglobby
- **Watch mode:** 30-50% faster per change using picomatch
- **Large codebases:** Parallel processing with worker threads
- **Smart caching:** Results cached in watch mode for unchanged files

## License

MIT
