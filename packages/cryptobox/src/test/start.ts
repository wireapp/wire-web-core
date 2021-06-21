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
// @ts-ignore
import nodeEndpoint from 'comlink/dist/esm/node-adapter.mjs';
import {PublicCryptobox} from '../PublicCryptobox';

async function getCryptoboxWorker(): Promise<Remote<PublicCryptobox>> {
  const inBrowser = typeof process !== 'object';
  const workerConstructor = inBrowser ? Worker : (await import('worker_threads')).Worker;
  const worker = new workerConstructor('./src/cryptobox.webworker.js');
  return wrap<PublicCryptobox>(inBrowser ? worker : nodeEndpoint(worker));
}

(async () => {
  const cryptobox = await getCryptoboxWorker();
  const result = await cryptobox.fingerprint();
  console.info(result);
})().catch(console.error);
