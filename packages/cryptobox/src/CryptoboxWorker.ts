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

import {expose} from 'comlink';
import {PublicCryptobox} from './PublicCryptobox';
import {Cryptobox} from './Cryptobox';
import {MemoryEngine} from '@wireapp/store-engine';
// @ts-ignore
import nodeEndpoint from 'comlink/dist/esm/node-adapter.mjs';

const api: PublicCryptobox = {
  fingerprint: async function (): Promise<string> {
    const storage = new MemoryEngine();
    await storage.init('storage');

    const cryptobox = new Cryptobox(storage);
    await cryptobox.create();

    return cryptobox.getIdentity().public_key.fingerprint();
  },
};

async function getEndpoint() {
  const inBrowser = typeof process !== 'object';
  return inBrowser ? undefined : nodeEndpoint((await import('worker_threads')).parentPort);
}

void getEndpoint().then(endpoint => expose(api, endpoint));
