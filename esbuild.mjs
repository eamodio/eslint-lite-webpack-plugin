//@ts-check
import * as esbuild from 'esbuild';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

// import eslint from 'esbuild-plugin-eslint';
// import { typecheckPlugin } from '@jgoz/esbuild-plugin-typecheck';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

let index = args.indexOf('--mode');
/** @type {'production' | 'development' | 'none'} */
// @ts-ignore
const mode = (index >= 0 ? args[index + 1] : undefined) || 'none';

const watch = args.includes('--watch');
const check = !args.includes('--no-check');

/**
 * @param { 'production' | 'development' | 'none' } mode
 */
async function build(mode) {
	let plugins = [];
	if (check) {
		// plugins.push(typecheckPlugin(), eslint());
	}

	/** @type {esbuild.BuildOptions} */
	const options = {
		bundle: true,
		entryPoints: ['src/index.ts'],
		entryNames: '[dir]/index',
		drop: ['debugger'],
		external: ['eslint', 'webpack'],
		format: 'cjs',
		legalComments: 'none',
		logLevel: 'info',
		mainFields: ['module', 'main'],
		minify: mode === 'production',
		outdir: 'dist',
		packages: 'external',
		platform: 'node',
		sourcemap: mode !== 'production',
		target: ['es2022', 'node18.15.0'],
		treeShaking: true,
		tsconfig: 'tsconfig.json',
		plugins: plugins,
	};

	if (watch) {
		const ctx = await esbuild.context(options);
		await ctx.watch();
	} else {
		await esbuild.build(options);
	}
}

try {
	await build(mode);
	spawnSync('pnpm', ['tsc', '--emitDeclarationOnly'], {
		cwd: __dirname,
		encoding: 'utf8',
		shell: true,
	});
} catch (ex) {
	console.error(ex);
	process.exit(1);
}
