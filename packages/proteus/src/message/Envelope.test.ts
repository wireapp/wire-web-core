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

import {DecodeError} from '@wireapp/cbor';
import {MacKey} from '../derived/MacKey';
import {PublicKey} from '../keys/PublicKey';
import {IdentityKey} from '../keys/IdentityKey';
import {KeyPair} from '../keys/KeyPair';
import {SessionTag} from './SessionTag';
import {CipherMessage} from './CipherMessage';
import {Envelope} from './Envelope';
import {PreKeyMessage} from './PreKeyMessage';

describe('Envelope', () => {
  const mac_key = new MacKey(new Uint8Array(32).fill(1));

  const session_tag = new SessionTag();

  let identityKey: IdentityKey;
  let baseKey: PublicKey;
  let ratchetKey: PublicKey;

  beforeAll(async () => {
    identityKey = new IdentityKey(new KeyPair().public_key);
    baseKey = new KeyPair().public_key;
    ratchetKey = new KeyPair().public_key;
  });

  it('encapsulates a CipherMessage', () => {
    const message = new CipherMessage(session_tag, 42, 3, ratchetKey, new Uint8Array([1, 2, 3, 4, 5]));
    const envelope = new Envelope(mac_key, message);

    expect(envelope.verify(mac_key)).toBe(true);
  });

  it('encapsulates a PreKeyMessage', () => {
    const msg = new PreKeyMessage(
      42,
      baseKey,
      identityKey,
      new CipherMessage(session_tag, 42, 43, ratchetKey, new Uint8Array([1, 2, 3, 4])),
    );

    const envelope = new Envelope(mac_key, msg);
    expect(envelope.verify(mac_key)).toBe(true);
  });

  it('encodes to and decode from CBOR', () => {
    const msg = new PreKeyMessage(
      42,
      baseKey,
      identityKey,
      new CipherMessage(session_tag, 42, 43, ratchetKey, new Uint8Array([1, 2, 3, 4])),
    );

    const envelope = new Envelope(mac_key, msg);
    expect(envelope.verify(mac_key)).toBe(true);

    const envelopeSerialised = envelope.serialise();
    const envelopeCopy = Envelope.deserialise(envelopeSerialised);

    expect(envelopeCopy.verify(mac_key)).toBe(true);
  });

  // This test conforms to the following testing standards:
  // @SF.Messages @TSFI.RESTfulAPI
  it('fails when passing invalid input', () => {
    const empty_buffer = new ArrayBuffer(0);
    try {
      Envelope.deserialise(empty_buffer);
    } catch (error) {
      expect(error instanceof DecodeError).toBe(true);
    }
  });
});
