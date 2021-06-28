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

const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const config = require('./webpack.config.js');

const devConfig = {
  devServer: {
    contentBase: `${process.cwd()}/..`,
    host: 'localhost',
    hot: true,
    open: true,
    overlay: {
      errors: true,
      warnings: true,
    },
    port: 8080,
    stats: 'errors-only',
    watchContentBase: true,
  },
  entry: [`${process.cwd()}/src/test/start.ts`],
  plugins: [new webpack.HotModuleReplacementPlugin(), new HtmlWebpackPlugin()],
};

module.exports = {
  ...config,
  ...devConfig,
};
