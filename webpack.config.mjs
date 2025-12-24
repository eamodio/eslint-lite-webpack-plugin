//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodeExternals from 'webpack-node-externals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @param {{ mode: 'production' | 'development' | 'none' | undefined }} argv
 * @returns { WebpackConfig }
 */
export default function (env, argv) {
	const mode = argv.mode || 'none';

	return {
		name: `plugin`,
		entry: './src/index.ts',
		mode: mode,
		target: 'node',
		devtool: mode === 'production' ? false : 'source-map',
		output: {
			filename: 'index.js',
			path: path.resolve(__dirname, 'dist'),
			libraryTarget: 'commonjs2',
		},
		module: {
			rules: [
				{
					exclude: /\.d\.ts$/,
					include: path.join(__dirname, 'src'),
					test: /\.tsx?$/,
					use: 'ts-loader',
				},
			],
		},
		resolve: {
			extensions: ['.ts'],
		},
		optimization: {
			minimize: false, //mode === 'production',
		},
		externals: [nodeExternals()],
		externalsPresets: {
			node: true,
		},
		infrastructureLogging:
			mode === 'production'
				? undefined
				: {
						level: 'log', // enables logging required for problem matchers
					},
	};
}
