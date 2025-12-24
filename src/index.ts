import * as path from 'node:path';
import * as process from 'node:process';
import { Worker } from 'node:worker_threads';
import { ESLint } from 'eslint';
import picomatch from 'picomatch';
import { globSync } from 'tinyglobby';
import type { Compilation, Compiler } from 'webpack';
import { WebpackError } from 'webpack';

interface ESLintLitePluginOptions {
	files: string;
	exclude?: string | string[];
	eslintOptions?: Pick<
		ESLint.Options,
		'cache' | 'cacheLocation' | 'cacheStrategy' | 'concurrency' | 'overrideConfigFile'
	>;
	worker?: boolean | { max: number; filesPerWorker?: number };
	reportingRoot?: string;
}

// Pre-compiled regex for performance
const nodeModulesRegex = /(^|[\\/])node_modules([\\/]|$)/;

class ESLintLitePlugin {
	static readonly name = 'eslint-lite';
	static readonly workerFilesThreshold = 50;

	private readonly options: Omit<ESLintLitePluginOptions, 'reportingRoot'> & { reportingRoot: string };
	private readonly minimatcher: (input: string) => boolean;
	private readonly excludeMatcher: ((input: string) => boolean) | undefined;
	private eslint: ESLint | undefined;
	private eslintOptionsJSON: string | undefined;

	constructor(options: ESLintLitePluginOptions) {
		if (!options?.files) throw new Error('No files specified');

		// Validate worker configuration
		if (options.worker != null && typeof options.worker === 'object') {
			if (options.worker.max != null && (options.worker.max < 1 || !Number.isInteger(options.worker.max))) {
				throw new Error('worker.max must be a positive integer');
			}
			if (
				options.worker.filesPerWorker != null &&
				(options.worker.filesPerWorker < 1 || !Number.isInteger(options.worker.filesPerWorker))
			) {
				throw new Error('worker.filesPerWorker must be a positive integer');
			}
		}

		const normalizedFiles = options.files.replace(/\\/gu, '/');
		this.options = {
			worker: true,
			...options,
			files: normalizedFiles,
			reportingRoot: options.reportingRoot ?? process.cwd(),
		};
		// Pre-compile picomatch pattern for better performance
		this.minimatcher = picomatch(normalizedFiles);

		// Pre-compile exclude pattern if provided
		if (options.exclude) {
			// Validate and normalize exclude patterns
			const excludePatterns = Array.isArray(options.exclude) ? options.exclude : [options.exclude];
			const validPatterns = excludePatterns.filter(p => p && p.trim() !== '');

			if (validPatterns.length === 0) {
				throw new Error('exclude patterns cannot be empty strings');
			}

			const normalizedExclude = validPatterns.map(pattern => pattern.replace(/\\/gu, '/'));
			this.excludeMatcher = picomatch(normalizedExclude);
		}
	}

	apply(compiler: Compiler) {
		let initialRun = true;
		let resultsCache: Map<string, ESLint.LintResult> | undefined;

		// Clean up results cache for changed/removed files to prevent memory leaks and stale results
		compiler.hooks.invalid.tap(ESLintLitePlugin.name, (fileName, _changeTime) => {
			if (resultsCache && fileName) {
				resultsCache.delete(fileName);
			}
		});

		compiler.hooks.make.tapPromise(ESLintLitePlugin.name, async compilation => {
			const start = Date.now();
			const logger = compilation.compiler.getInfrastructureLogger(ESLintLitePlugin.name);

			// Reuse ESLint instance for better performance
			if (this.eslint == null) {
				const eslintOptions =
					this.options.eslintOptions != null
						? {
								cache: this.options.eslintOptions.cache,
								cacheLocation: this.options.eslintOptions.cacheLocation,
								cacheStrategy: this.options.eslintOptions.cacheStrategy,
								concurrency: this.options.eslintOptions.concurrency,
								overrideConfigFile: this.options.eslintOptions.overrideConfigFile,
							}
						: {};
				this.eslint = new ESLint(eslintOptions);
				// Pre-serialize options for workers to avoid repeated JSON.stringify
				this.eslintOptionsJSON = JSON.stringify(eslintOptions);
			}
			const eslint = this.eslint;

			const files = new Set<string>();
			const startGlobbing = Date.now();

			// If it's the initial run, lint all files.
			if (initialRun) {
				// Build ignore patterns for tinyglobby (node_modules always excluded)
				const ignorePatterns = this.options.exclude
					? Array.isArray(this.options.exclude)
						? ['**/node_modules/**', ...this.options.exclude]
						: ['**/node_modules/**', this.options.exclude]
					: ['**/node_modules/**'];

				// Use tinyglobby for fast file discovery
				const candidateFiles = globSync(this.options.files, {
					cwd: compiler.context,
					ignore: ignorePatterns,
					absolute: true,
					onlyFiles: true,
				});

				// Check all files in parallel for better performance
				if (candidateFiles.length) {
					const ignoredChecks = await Promise.allSettled(
						candidateFiles.map(file => eslint.isPathIgnored(file)),
					);
					for (let i = 0; i < candidateFiles.length; i++) {
						const check = ignoredChecks[i];
						if (check.status === 'rejected') {
							// If check failed, log warning and add file (fail-safe)
							logger.warn(`Failed to check if file is ignored: ${candidateFiles[i]} - ${check.reason}`);
							files.add(candidateFiles[i]);
						} else if (!check.value) {
							// File is not ignored, add it
							files.add(candidateFiles[i]);
						}
					}
				}
			} else if (compilation.compiler.modifiedFiles?.size) {
				// Pre-filter with regex before expensive minimatch
				const candidateFiles: string[] = [];
				for (const file of compilation.compiler.modifiedFiles) {
					if (!nodeModulesRegex.test(file)) {
						candidateFiles.push(file);
					}
				}

				// Batch process picomatch and isPathIgnored checks
				if (candidateFiles.length) {
					// Webpack provides absolute paths, but user patterns are typically relative
					// Convert to relative paths for matching
					const matchResults = candidateFiles.map(file => {
						const relativePath = path.relative(compiler.context, file).replace(/\\/gu, '/');
						// Check if file matches include pattern and doesn't match exclude pattern
						const isIncluded = this.minimatcher(relativePath);
						const isExcluded = this.excludeMatcher?.(relativePath) ?? false;
						return isIncluded && !isExcluded;
					});
					const matchedFiles = candidateFiles.filter((_, i) => matchResults[i]);

					if (matchedFiles.length) {
						const ignoredChecks = await Promise.allSettled(
							matchedFiles.map(file => eslint.isPathIgnored(file)),
						);
						for (let i = 0; i < matchedFiles.length; i++) {
							const check = ignoredChecks[i];
							if (check.status === 'rejected') {
								// If check failed, log warning and add file (fail-safe)
								logger.warn(`Failed to check if file is ignored: ${matchedFiles[i]} - ${check.reason}`);
								files.add(matchedFiles[i]);
							} else if (!check.value) {
								// File is not ignored, add it
								files.add(matchedFiles[i]);
							}
						}
					}
				}
			}

			if (files.size === 0) {
				logger.log(
					`Linting '${compilation.compiler.name}' found 0 files to lint in \x1b[32m${
						Date.now() - startGlobbing
					}ms\x1b[0m`,
				);
				return;
			}

			logger.log(
				`Linting '${compilation.compiler.name}' found ${files.size} files in \x1b[32m${
					Date.now() - startGlobbing
				}ms\x1b[0m`,
			);

			async function run(
				this: ESLintLitePlugin,
				compilation: Compilation,
				files: Set<string>,
				reportingRoot: string,
				isInitialRun: boolean,
			) {
				let logSuffix = ` ${files.size} files`;

				try {
					let results: ESLint.LintResult[];

					if (this.options.worker && files.size > ESLintLitePlugin.workerFilesThreshold) {
						// Use pre-serialized options
						const eslintOptionsJSON = this.eslintOptionsJSON!;

						async function runWorker(id: number, files: string[]): Promise<ESLint.LintResult[]> {
							const start = Date.now();

							const workerResults = await new Promise<ESLint.LintResult[]>((resolve, reject) => {
								const code = `
	const { ESLint } = require('eslint');
	const { parentPort } = require('worker_threads');

	const eslint = new ESLint(${eslintOptionsJSON});

	async function run() {
		try {
			const results = await eslint.lintFiles(${JSON.stringify(files)});
			parentPort.postMessage({ success: true, results });
		} catch (error) {
			parentPort.postMessage({ success: false, error: error.message });
		}
	}
	run();
	`;
								const worker = new Worker(code, { eval: true });
								let resolved = false;
								let timeoutId: NodeJS.Timeout | undefined;

								const cleanup = () => {
									if (timeoutId != null) {
										clearTimeout(timeoutId);
										timeoutId = undefined;
									}
									void worker.terminate();
								};

								worker.on('message', r => {
									if (!resolved) {
										resolved = true;
										cleanup();
										if (r.success) {
											resolve(r.results);
										} else {
											reject(new Error(r.error));
										}
									}
								});

								worker.on('error', ex => {
									if (!resolved) {
										resolved = true;
										cleanup();
										reject(ex instanceof Error ? ex : new Error(String(ex)));
									}
								});

								worker.on('exit', code => {
									if (!resolved) {
										resolved = true;
										cleanup();
										reject(new Error(`Worker ${id} exited with code ${code}`));
									}
								});

								// Timeout after 5 minutes
								timeoutId = setTimeout(
									() => {
										if (!resolved) {
											resolved = true;
											cleanup();
											reject(new Error(`Worker ${id} timed out after 5 minutes`));
										}
									},
									5 * 60 * 1000,
								);
							});

							logger.log(
								`Linting '${compilation.compiler.name}' worker(${id}) finished ${
									files.length
								} files in \x1b[32m${Date.now() - start}ms\x1b[0m`,
							);

							return workerResults;
						}

						// Convert Set to Array once
						const filesArray = Array.from(files);
						let chunks: string[][] | undefined;
						if (
							typeof this.options.worker !== 'boolean' &&
							this.options.worker.max != null &&
							this.options.worker.max > 1
						) {
							chunks = chunk(
								filesArray,
								this.options.worker.max,
								this.options.worker.filesPerWorker ?? 500,
							);
						}

						logSuffix += ` via ${chunks?.length ?? 1} workers`;
						logger.log(`Linting '${compilation.compiler.name}'${logSuffix}...`);

						if (chunks != null && chunks.length > 1) {
							// Run workers in parallel and collect results properly
							const workerPromises = chunks.map((c, id) => runWorker(id, c));
							const settledResults = await Promise.allSettled(workerPromises);

							// Collect successful results and log failures
							const resultArrays: ESLint.LintResult[][] = [];
							for (let i = 0; i < settledResults.length; i++) {
								const settled = settledResults[i];
								if (settled.status === 'fulfilled') {
									resultArrays.push(settled.value);
								} else {
									logger.error(
										`Linting '${compilation.compiler.name}' worker(${i}) failed: ${settled.reason}`,
									);
									// Add error to compilation but continue with other workers
									compilation.errors.push(
										new ESLintError(
											`Worker ${i} failed: ${settled.reason instanceof Error ? settled.reason.message : String(settled.reason)}`,
										),
									);
								}
							}
							results = resultArrays.flat();
						} else {
							results = await runWorker(0, chunks?.[0] ?? filesArray);
						}
					} else {
						logger.log(`Linting '${compilation.compiler.name}'${logSuffix}...`);
						// Convert Set to Array once
						results = await eslint.lintFiles(Array.from(files));
					}

					if (compiler.watchMode) {
						resultsCache ??= new Map();

						if (isInitialRun) {
							resultsCache.clear();
						} else {
							// Remove old results for files that were linted
							for (const file of files) {
								resultsCache.delete(file);
							}
						}

						// Update cache with new results (including files with no issues)
						for (const result of results) {
							resultsCache.set(result.filePath, result);
						}
					}

					const resultsToProcess =
						compiler.watchMode && resultsCache ? Array.from(resultsCache.values()) : results;

					// Pre-allocate arrays for better performance
					const errors: ESLintIssue[] = [];
					const warnings: ESLintIssue[] = [];

					for (const result of resultsToProcess) {
						// Skip results with no issues
						if (result.errorCount === 0 && result.warningCount === 0) continue;

						// Safely compute relative path
						let file: string;
						try {
							const relativePath = path.relative(reportingRoot, result.filePath);
							// Handle empty path (same directory) or ensure proper prefix
							file = relativePath ? `./${relativePath.replace(/\\/gu, '/')}` : result.filePath;
						} catch {
							// Fallback to absolute path if relative fails
							file = result.filePath.replace(/\\/gu, '/');
						}

						// Process messages in a single loop
						for (const message of result.messages) {
							if (message.severity === 2) {
								errors.push(new ESLintIssue(file, message));
							} else if (message.severity === 1) {
								warnings.push(new ESLintIssue(file, message));
							}
						}
					}

					// Batch push to compilation arrays for better performance
					if (errors.length) {
						compilation.errors.push(...errors);
					}
					if (warnings.length) {
						compilation.warnings.push(...warnings);
					}
				} catch (ex) {
					logger.error(`Linting '${compilation.compiler.name}'${logSuffix} failed: ${ex}`);
					compilation.errors.push(new ESLintError(ex instanceof Error ? ex.message : String(ex)));
				} finally {
					logger.log(
						`Linting '${compilation.compiler.name}'${logSuffix} finished in \x1b[32m${
							Date.now() - start
						}ms\x1b[0m`,
					);
				}
			}

			await run.call(this, compilation, files, this.options.reportingRoot, initialRun);
			initialRun = false;
		});
	}
}

export { ESLintLitePlugin };
export type { ESLintLitePluginOptions };

class ESLintError extends WebpackError {
	constructor(message: string) {
		super(`[eslint-lite] ${message}`);
		this.name = 'ESLintError';
		this.stack = '';
	}
}

class ESLintIssue extends WebpackError {
	constructor(file: string, issue: ESLint.LintResult['messages'][0]) {
		let fileAndLocation = file;
		if (issue.line != null) {
			fileAndLocation += `:${issue.line}`;
			if (issue.column != null) {
				fileAndLocation += `:${issue.column}`;
			}

			if (issue.endLine != null) {
				fileAndLocation += `-${issue.endLine}`;
				if (issue.endColumn != null) {
					fileAndLocation += `:${issue.endColumn}`;
				}
			}
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
