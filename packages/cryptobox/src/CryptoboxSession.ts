/*
 * Wire
 * Copyright (C) 2018 Wire Swiss GmbH
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

import {DecryptionError} from './error/DecryptionError';
import type {CryptoboxCRUDStore} from './store/';
import {message as ProteusMessage, session as ProteusSession} from '@wireapp/proteus';

export class CryptoboxSession {
  public readonly id: string;
  public readonly session: ProteusSession.Session;

  constructor(id: string, session: ProteusSession.Session) {
    this.id = id;
    this.session = session;
    Object.freeze(this);
  }

  public async decrypt(ciphertext: ArrayBuffer, pk_store: CryptoboxCRUDStore): Promise<Uint8Array> {
    if (ciphertext.byteLength === 0) {
      throw new DecryptionError('Cannot decrypt an empty ArrayBuffer.');
    }

    const envelope = ProteusMessage.Envelope.deserialise(ciphertext);
    return this.session.decrypt(pk_store, envelope);
  }

  public encrypt(plaintext: string | Uint8Array): ArrayBuffer {
    const ciphertext = ProteusSession.Session.encrypt(this.session, plaintext);
    return ciphertext.serialise();
  }

  public fingerprint_local(): string {
    return this.session.local_identity.public_key.fingerprint();
  }

  public fingerprint_remote(): string {
    return this.session.remote_identity.fingerprint();
  }
}
