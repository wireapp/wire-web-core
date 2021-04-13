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

import {Decoder, Encoder} from '@wireapp/cbor';
import {KeyPair} from './KeyPair';
import {DecodeError} from '../errors';

/**
 * Pre-generated (and regularly refreshed) pre-keys.
 * A Pre-Shared Key contains the public long-term identity and ephemeral handshake keys for the initial triple DH.
 */
export class PreKey {
  static readonly MAX_PREKEY_ID = 0xffff;
  readonly key_id: number;
  readonly key_pair: KeyPair;
  readonly version: number;
  private static readonly propertiesLength = 3;

  constructor(keyId: number = -1, keyPair: KeyPair = new KeyPair(), version: number = 1) {
    this.key_id = keyId;
    this.key_pair = keyPair;
    this.version = version;
  }

  static last_resort(): PreKey {
    return new PreKey(PreKey.MAX_PREKEY_ID);
  }

  static generate_prekeys(start: number, size: number): PreKey[] {
    if (size === 0) {
      return [];
    }

    return Array.from({length: size}).map((_, index) => new PreKey((start + index) % PreKey.MAX_PREKEY_ID));
  }

  serialise(): ArrayBuffer {
    const encoder = new Encoder();
    PreKey.encode(encoder, this);
    return encoder.get_buffer();
  }

  static deserialise(buf: ArrayBuffer): PreKey {
    return PreKey.decode(new Decoder(buf));
  }

  static encode(encoder: Encoder, preKey: PreKey): Encoder {
    encoder.object(PreKey.propertiesLength);
    encoder.u8(0);
    encoder.u8(preKey.version);
    encoder.u8(1);
    encoder.u16(preKey.key_id);
    encoder.u8(2);
    return KeyPair.encode(encoder, preKey.key_pair);
  }

  static decode(decoder: Decoder): PreKey {
    const propertiesLength = decoder.object();
    if (propertiesLength === PreKey.propertiesLength) {
      decoder.u8();
      const version = decoder.u8();

      decoder.u8();
      const keyId = decoder.u16();

      decoder.u8();
      const keyPair = KeyPair.decode(decoder);

      return new PreKey(keyId, keyPair, version);
    }

    throw new DecodeError(`Unexpected number of properties: "${propertiesLength}"`);
  }
}
