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
import type {Config} from 'karma';
import webpackConfig from './webpack.config';
import {ConfigOptions} from 'karma';

const testCode = 'src/**/*test.browser.ts';

module.exports = (config: Config): void => {
  config.set({
    autoWatch: false,
    basePath: '',
    browsers: ['ChromeNoSandbox'],
    client: {
      useIframe: false,
    },
    colors: true,
    concurrency: Infinity,
    customLaunchers: {
      ChromeNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox'],
      },
    },
    files: [{pattern: testCode, watched: false}],
    frameworks: ['jasmine', 'webpack'],
    port: 9876,
    preprocessors: {
      [testCode]: ['webpack'],
    },
    reporters: ['progress'],
    singleRun: true,
    webpack: webpackConfig,
  } as ConfigOptions);
};
