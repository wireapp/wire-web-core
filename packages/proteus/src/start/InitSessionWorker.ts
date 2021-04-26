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

import {parentPort, MessagePort} from 'worker_threads';
import { IdentityKeyPair } from '../keys/IdentityKeyPair';
import { PreKeyBundle } from '../keys/PreKeyBundle';
import { Session } from '../session/Session';
import {initProteus} from "../initProteus";

export interface SessionCreationOptions {
  ownIdentity: IdentityKeyPair;
  preKeyBundles: PreKeyBundle[];
}

async function createSessions(ownIdentity: IdentityKeyPair, preKeyBundles: PreKeyBundle[]): Promise<Session[]> {
  await initProteus();
  return preKeyBundles.map(pkb => Session.init_from_prekey(ownIdentity, pkb));
}

parentPort?.on('message', async (message: {port: MessagePort; value: SessionCreationOptions}) => {
  const {ownIdentity, preKeyBundles} = message.value;
  const sessions = await createSessions(ownIdentity, preKeyBundles);
  message.port.postMessage(sessions);
  message.port.close();
});
