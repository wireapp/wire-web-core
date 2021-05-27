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

import {Remote, wrap} from 'comlink';
import type {PublicCryptobox} from '../PublicCryptobox';
import nodeEndpoint from 'comlink/dist/esm/node-adapter';

function getCryptoboxWorker(): Remote<PublicCryptobox> {
  const inBrowser = typeof process !== 'object';
  const workerConstructor = inBrowser ? Worker : require('worker_threads').Worker;
  const worker = new workerConstructor('./src/cryptobox.webworker.js');
  return wrap<PublicCryptobox>(inBrowser ? worker : nodeEndpoint(worker));
}

(async () => {
  const cryptobox = getCryptoboxWorker();
  const fingerprint = await cryptobox.fingerprint();
  console.info(fingerprint);
})().catch(console.error);
