//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require('path');

module.exports =
	/**
	 * @param {{ mode: 'production' | 'development' | 'none' | undefined }} argv
	 * @returns { WebpackConfig }
	 */
	function (env, argv) {
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
				minimize: mode === 'production',
			},
			externals: {
				eslint: 'commonjs eslint',
				webpack: 'commonjs webpack',
			},
			infrastructureLogging:
				mode === 'production'
					? undefined
					: {
							level: 'log', // enables logging required for problem matchers
					  },
		};
	};
