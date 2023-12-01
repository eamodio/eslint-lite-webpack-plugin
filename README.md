# eslint-lite-webpack-plugin

A lightweight ESLint plugin for Webpack.

## Installation

You'll first need to install [ESLint](http://eslint.org):

```
$ npm i eslint --save-dev
```

Next, install `eslint-lite-webpack-plugin`:

```
$ npm install @eamodio/eslint-lite-webpack-plugin --save-dev
```

## Usage

Add the plugin to your `webpack.config.js`:

```js
const ESLintLitePlugin = require('@eamodio/eslint-lite-webpack-plugin');

module.exports = {
  ...
  plugins: [new ESLintLitePlugin()],
  ...
};
```
