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

import {performance, PerformanceObserver} from 'perf_hooks';
import {IdentityKeyPair, PreKey, PreKeyBundle} from '../keys';
import {Session} from '../session';
import {init} from '@wireapp/proteus';
import * as os from 'os';
import * as path from 'path';
import {Worker} from 'worker_threads';

function chunkArray<T>(array: T[], size: number): T[][] {
  return Array.from({length: Math.ceil(array.length / size)}, (_, index) =>
    array.slice(index * size, index * size + size),
  );
}

function createThreadedSessions(ownIdentity: IdentityKeyPair, preKeyBundles: PreKeyBundle[]): Promise<Session[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve('src', 'worker.js'), {
      workerData: {
        ownIdentity,
        preKeyBundles,
        workerPath: path.resolve(__dirname, 'InitSessionWorker.ts'),
      },
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code "${code}".`));
      }
    });
  });
}

async function main() {
  await init();

  const amountOfUsers = 500;
  const clientsPerUser = 8;
  const amountOfRemoteIdentities = amountOfUsers * clientsPerUser;

  function generatePreKeyBundle(): PreKeyBundle {
    const identity = IdentityKeyPair.new();
    const preKey = PreKey.last_resort();
    return new PreKeyBundle(identity.public_key, preKey);
  }

  const observer = new PerformanceObserver(items => items.getEntries().forEach(entry => console.info(entry)));
  observer.observe({buffered: true, entryTypes: ['measure', 'function']});

  performance.mark('bundlesStart');
  const preKeyBundles = Array.from({length: amountOfRemoteIdentities}, generatePreKeyBundle);
  performance.mark('bundlesStop');
  performance.measure(`Generating "${preKeyBundles.length}" pre-key bundles`, 'bundlesStart', 'bundlesStop');

  const ownIdentity = IdentityKeyPair.new();
  const amountOfThreads = os.cpus().length;
  const bundlesPerThread = preKeyBundles.length / amountOfThreads;
  const preKeyBundleChunks = chunkArray<PreKeyBundle>(preKeyBundles, bundlesPerThread);
  console.info(`Your machine has "${amountOfThreads}" threads.`);
  console.info(
    `Splitting "${preKeyBundles.length}" pre-key bundles into "${preKeyBundleChunks.length}" chunks with "${bundlesPerThread}" bundles each...`,
  );

  performance.mark('sessionsStart');
  const sessionsFromThreads = preKeyBundleChunks.map(sessions => createThreadedSessions(ownIdentity, sessions));
  const sessionChunks = await Promise.all(sessionsFromThreads);
  const sessions = ([] as Session[]).concat(...sessionChunks);
  performance.mark('sessionsStop');
  performance.measure(`Initializing "${sessions.length}" sessions`, 'sessionsStart', 'sessionsStop');

  performance.mark('encryptStart');
  const envelopes = sessions.map(session => session.encrypt('Hello, World!'));
  performance.mark('encryptStop');
  performance.measure(`Encrypting "${envelopes.length}" texts`, 'encryptStart', 'encryptStop');
}

main().catch(console.error);
