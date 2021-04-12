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

import {parentPort, workerData} from 'worker_threads';
import {Session} from '../session';
import {IdentityKeyPair, PreKeyBundle} from '../keys';
import {init} from '../index';

async function createSession({
  ownIdentity,
  preKeyBundles,
}: {
  ownIdentity: ArrayBuffer;
  preKeyBundles: ArrayBuffer[];
}): Promise<ArrayBuffer[]> {
  await init();
  const alice = IdentityKeyPair.deserialise(ownIdentity);
  return preKeyBundles.map(pkb => Session.init_from_prekey(alice, PreKeyBundle.deserialise(pkb)).serialise());
}

void (async () => {
  parentPort?.postMessage(await createSession(workerData));
})();
