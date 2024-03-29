/*
 * Wire
 * Copyright (C) 2021 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

const webpack = require('webpack');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: ['./src/CryptoboxWorker.ts'],
  externals: {
    'fs-extra': '{}',
  },
  mode: 'development',
  module: {
    rules: [
      {
        exclude: /(node_modules)/,
        loader: 'babel-loader',
        test: /\.[tj]sx?$/,
      },
    ],
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
      }),
    ],
  },
  output: {
    filename: 'cryptobox.webworker.js',
    path: path.resolve(__dirname, 'src'),
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
  resolve: {
    extensions: ['.js', '.ts'],
    fallback: {
      crypto: false,
      path: false,
      worker_threads: false,
    },
  },
  stats: {
    errorDetails: true,
  },
};
