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
import * as path from 'path';
import {MessageChannel, Worker} from 'worker_threads';
import type {SessionCreationOptions} from './InitSessionWorker';
import {Session} from '../session/Session';
import {PreKeyBundle} from '../keys/PreKeyBundle';
import {IdentityKeyPair} from '../keys/IdentityKeyPair';
import {PreKey} from '../keys/PreKey';
import {initProteus} from '../initProteus';
import {program} from 'commander';
import * as os from 'os';

program.option('--workers [amount]', 'amount of workers').parse();

function mapWorkers(workers: undefined | boolean | string): number {
  switch (typeof workers) {
    case 'undefined':
      return 0;
    case 'boolean':
      return workers === true ? os.cpus().length : 0;
    case 'string':
      return parseInt(workers);
  }
}

const amountOfWorkers = mapWorkers(program.opts().workers);

function spawnWorker(): {
  closeConnection: () => void;
  initSessions: (data: SessionCreationOptions) => Promise<Session[]>;
} {
  const {port1: fromWorker, port2: toWorker} = new MessageChannel();

  const worker = new Worker(path.resolve('src/worker.js'), {
    workerData: {
      workerPath: path.resolve(__dirname, 'InitSessionWorker.ts'),
    },
  });

  return {
    closeConnection: () => {
      fromWorker.close();
      toWorker.close();
    },
    initSessions: (data: SessionCreationOptions): Promise<Session[]> => {
      return new Promise((resolve, reject) => {
        worker.postMessage({port: toWorker, value: data}, [toWorker]);
        fromWorker.on('message', resolve);
        fromWorker.on('messageerror', reject);
      });
    },
  };
}

function chunkArray<T>(array: T[], size: number): T[][] {
  return Array.from({length: Math.ceil(array.length / size)}, (_, index) =>
    array.slice(index * size, index * size + size),
  );
}

async function main() {
  await initProteus();

  const amountOfUsers = 500;
  const clientsPerUser = 8;
  const amountOfRemoteIdentities = amountOfUsers * clientsPerUser;

  function generatePreKeyBundle(): PreKeyBundle {
    const identity = new IdentityKeyPair();
    const preKey = PreKey.last_resort();
    return new PreKeyBundle(identity.public_key, preKey);
  }

  const observer = new PerformanceObserver(items => items.getEntries().forEach(entry => console.info(entry)));
  observer.observe({buffered: true, entryTypes: ['measure', 'function']});

  performance.mark('bundlesStart');
  const preKeyBundles = Array.from({length: amountOfRemoteIdentities}, generatePreKeyBundle);
  performance.mark('bundlesStop');
  performance.measure(`Generating "${preKeyBundles.length}" pre-key bundles`, 'bundlesStart', 'bundlesStop');

  const ownIdentity = new IdentityKeyPair();

  performance.mark('sessionsStart');

  let sessions: Session[] = [];

  if (amountOfWorkers) {
    const bundlesPerThread = preKeyBundles.length / amountOfWorkers;
    const preKeyBundleChunks = chunkArray<PreKeyBundle>(preKeyBundles, bundlesPerThread);
    console.info(`Run test with "${amountOfWorkers}" worker threads.`);

    performance.mark('workerPoolStart');
    const workers = Array.from({length: amountOfWorkers}, () => spawnWorker());
    performance.mark('workerPoolStop');
    performance.measure(`Creating "${workers.length}" worker threads`, 'workerPoolStart', 'workerPoolStop');

    console.info(
      `Splitting "${preKeyBundles.length}" pre-key bundles into "${preKeyBundleChunks.length}" chunks with "${bundlesPerThread}" bundles each...`,
    );

    for (let i = 0; i < preKeyBundleChunks.length; i++) {
      const preKeyBundles = preKeyBundleChunks[i];
      const sessionChunks = await workers[i].initSessions({
        ownIdentity,
        preKeyBundles,
      });
      sessions.push(...sessionChunks);
      workers[i].closeConnection();
    }
  } else {
    sessions = preKeyBundles.map(pkb => Session.init_from_prekey(ownIdentity, pkb));
  }

  performance.mark('sessionsStop');
  performance.measure(`Initializing "${sessions.length}" sessions`, 'sessionsStart', 'sessionsStop');

  performance.mark('encryptStart');
  const envelopes = sessions.map(session => Session.encrypt(session, 'Hello, World!'));
  performance.mark('encryptStop');
  performance.measure(`Encrypting "${envelopes.length}" texts`, 'encryptStart', 'encryptStop');
}

main().catch(console.error);
