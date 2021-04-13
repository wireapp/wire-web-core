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
import {IdentityKey, KeyPair, SecretKey} from './';
import {DecodeError} from '../errors';

export class IdentityKeyPair {
  readonly public_key: IdentityKey;
  readonly secret_key: SecretKey;
  readonly version: number;
  private static readonly propertiesLength = 3;

  constructor(publicKey?: IdentityKey, secretKey?: SecretKey, version: number = 1) {
    const keyPair = new KeyPair();
    this.public_key = publicKey || new IdentityKey(keyPair.public_key);
    this.secret_key = secretKey || keyPair.secret_key;
    this.version = version;
  }

  serialise(): ArrayBuffer {
    const encoder = new Encoder();
    IdentityKeyPair.encode(encoder, this);
    return encoder.get_buffer();
  }

  static deserialise(buf: ArrayBuffer): IdentityKeyPair {
    const decoder = new Decoder(buf);
    return IdentityKeyPair.decode(decoder);
  }

  static encode(encoder: Encoder, identityKeyPair: IdentityKeyPair): Encoder {
    // Prepare KeyPair with three elements
    encoder.object(IdentityKeyPair.propertiesLength);

    // Add version at position 0
    encoder.u8(0);
    encoder.u8(identityKeyPair.version);

    // Add SecretKey at position 1
    encoder.u8(1);
    encoder.object(1);
    encoder.u8(0);
    encoder.bytes(identityKeyPair.secret_key.sec_edward);

    // Add IdentityKey at position 2
    encoder.u8(2);
    encoder.object(1);

    // Add PublicKey at position 0 of IdentityKey
    encoder.u8(0);
    encoder.object(1);
    encoder.u8(0);
    encoder.bytes(identityKeyPair.public_key.public_key.pub_edward);

    return encoder;
  }

  static decode(decoder: Decoder): IdentityKeyPair {
    const propertiesLength = decoder.object();
    if (propertiesLength === IdentityKeyPair.propertiesLength) {
      decoder.u8();
      const version = decoder.u8();

      decoder.u8();
      const secretKey = SecretKey.decode(decoder);

      decoder.u8();
      const publicKey = IdentityKey.decode(decoder);

      return new IdentityKeyPair(publicKey, secretKey, version);
    }

    throw new DecodeError(`Unexpected number of properties: "${propertiesLength}"`);
  }
}
