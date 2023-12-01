import * as path from 'path';
import { Worker } from 'worker_threads';
import type { ESLint } from 'eslint';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
import type { Compilation, Compiler } from 'webpack';
import { WebpackError } from 'webpack';

interface ESLintLitePluginOptions {
	files: string;
	eslintOptions?: Pick<ESLint.Options, 'cache' | 'cacheLocation' | 'cacheStrategy' | 'overrideConfigFile'>;
	worker?: boolean | { max: number; filesPerWorker?: number };
}

class ESLintLitePlugin {
	static readonly name = 'eslint-lite';
	static readonly workerFilesThreshold = 10;

	private readonly options: ESLintLitePluginOptions;

	constructor(options: ESLintLitePluginOptions) {
		if (options?.files == null) throw new Error('No files specified');
		this.options = { worker: true, ...options, files: options.files.replace(/\\/gu, '/') };
	}

	apply(compiler: Compiler) {
		let initialRun = true;

		compiler.hooks.make.tapPromise(ESLintLitePlugin.name, async compilation => {
			const logger = compilation.compiler.getInfrastructureLogger(ESLintLitePlugin.name);

			const eslintOptions =
				this.options.eslintOptions != null
					? {
							cache: this.options.eslintOptions.cache,
							cacheLocation: this.options.eslintOptions.cacheLocation,
							cacheStrategy: this.options.eslintOptions.cacheStrategy,
							overrideConfigFile: this.options.eslintOptions.overrideConfigFile,
					  }
					: {};
			const eslint = new (await import('eslint')).ESLint(eslintOptions);

			const files = new Set<string>();

			// If it's the initial run, lint all files.
			if (initialRun) {
				const paths = await glob(this.options.files, { withFileTypes: true });
				for (const path of paths) {
					if (!path.isENOENT() && path.isFile() && !path.path.includes('node_modules')) {
						const fullpath = path.fullpath();
						if (!(await eslint.isPathIgnored(fullpath))) {
							files.add(path.fullpath());
						}
					}
				}

				initialRun = false;
			} else if (compilation.compiler.modifiedFiles?.size) {
				for (const file of compilation.compiler.modifiedFiles) {
					if (!file.includes('node_modules')) {
						const match = minimatch(file, this.options.files);
						if (match && !(await eslint.isPathIgnored(file))) {
							files.add(file);
						}
					}
				}
			}

			if (files.size === 0) {
				logger.log(`Linting '${compilation.compiler.name}': Nothing to lint`);
				return;
			}

			async function run(this: ESLintLitePlugin, compilation: Compilation, files: Set<string>) {
				const start = Date.now();
				let logSuffix;

				try {
					const cwd = compilation.compiler.context ?? process.cwd();

					let results: ESLint.LintResult[];
					if (this.options.worker && files.size > ESLintLitePlugin.workerFilesThreshold) {
						async function runWorker(files: string[], results: ESLint.LintResult[]): Promise<void> {
							results.push(
								await new Promise((resolve, reject) => {
									const code = `
	const { ESLint } = require('eslint');
	const { parentPort } = require('worker_threads');

	const eslint = new ESLint(${JSON.stringify(eslintOptions)});

	async function run() {
		const results = await eslint.lintFiles(${JSON.stringify(files)});
		parentPort.postMessage(results.filter(r => r.errorCount > 0 || r.warningCount > 0));
	}
	run();
	`;
									new Worker(code, { eval: true })
										.on('message', r => resolve(r))
										.on('error', ex => reject(ex));
								}),
							);
						}

						let chunks: string[][] | undefined;
						if (typeof this.options.worker !== 'boolean' && this.options.worker.max > 1) {
							chunks = chunk(
								[...files],
								this.options.worker.max,
								this.options.worker.filesPerWorker ?? 500,
							);
						}

						logSuffix = ` via ${chunks?.length ?? 1} workers`;
						logger.log(`Linting '${compilation.compiler.name}'${logSuffix}...`);

						results = [];
						if (chunks != null && chunks.length > 1) {
							await Promise.allSettled(chunks.map(c => runWorker(c, results)));
						} else {
							await runWorker(chunks?.length ? chunks[0] : [...files], results);
						}
					} else {
						logger.log(`Linting '${compilation.compiler.name}'...`);
						results = await eslint.lintFiles([...files]);
					}

					for (const result of results) {
						let file: string;
						if (result.errorCount > 0) {
							file ??= `./${path.relative(cwd, result.filePath).replace(/\\/gu, '/')}`;
							for (const message of result.messages) {
								if (message.severity === 2) {
									compilation.errors.push(new ESLintIssue(file, message) as any);
								}
							}
						}

						if (result.warningCount > 0) {
							file ??= `./${path.relative(cwd, result.filePath).replace(/\\/gu, '/')}`;
							for (const message of result.messages) {
								if (message.severity === 1) {
									compilation.warnings.push(new ESLintIssue(file, message) as any);
								}
							}
						}
					}
				} catch (ex) {
					logger.error(`Linting '${compilation.compiler.name}'${logSuffix ?? ''} failed: ${ex}`);
					compilation.errors.push(new ESLintError(ex.message) as any);
				} finally {
					logger.log(
						`Linting '${compilation.compiler.name}'${logSuffix ?? ''} finished in \x1b[32m${
							Date.now() - start
						}ms\x1b[0m`,
					);
				}
			}

			await run.call(this, compilation, files);
		});
	}
}

export { ESLintLitePlugin, ESLintLitePluginOptions };

class ESLintError extends WebpackError {
	constructor(message: string) {
		super(`[eslint-lite] ${message}`);
		this.name = 'ESLintError';
		this.stack = '';
	}
}

class ESLintIssue extends WebpackError {
	constructor(file: string, issue: ESLint.LintResult['messages'][0]) {
		let fileAndLocation = `${file}:${issue.line}:${issue.column}`;
		if (issue.endLine != null && issue.endColumn != null) {
			fileAndLocation += `-${issue.endLine}:${issue.endColumn}`;
		}

		super(`\x1b[90m${issue.ruleId ?? 'Unknown'}: \x1b[0m${issue.message}`);
		this.name = 'ESLintIssue';
		this.file = fileAndLocation;
		this.stack = '';
	}
}

function chunk<T>(source: T[], maxChunks: number, idealChunkSize: number): T[][] {
	if (source.length <= idealChunkSize) return [source];

	const chunkCount = Math.min(Math.ceil(source.length / idealChunkSize), maxChunks);
	if (chunkCount === 1) return [source];

	const size = Math.ceil(source.length / chunkCount);

	const chunks: T[][] = [];

	let index = 0;
	while (index < source.length) {
		chunks.push(source.slice(index, index + size));
		index += size;
	}
	return chunks;
}
