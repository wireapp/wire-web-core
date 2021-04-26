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
import { DecodeError } from '../errors/DecodeError';
import {PublicKey} from './PublicKey';

/**
 * Construct a long-term identity key pair.
 *
 * Every client has a long-term identity key pair.
 * Long-term identity keys are used to initialise "sessions" with other clients (triple DH).
 */
export class IdentityKey {
  readonly public_key: PublicKey;
  private static readonly propertiesLength = 1;

  constructor(publicKey: PublicKey) {
    this.public_key = publicKey;
  }

  fingerprint(): string {
    return this.public_key.fingerprint();
  }

  static encode(encoder: Encoder, identityKey: IdentityKey): Encoder {
    encoder.object(IdentityKey.propertiesLength);
    encoder.u8(0);
    return PublicKey.encode(encoder, identityKey.public_key);
  }

  static decode(decoder: Decoder): IdentityKey {
    const propertiesLength = decoder.object();
    if (propertiesLength === IdentityKey.propertiesLength) {
      decoder.u8();
      const publicKey = PublicKey.decode(decoder);
      return new IdentityKey(publicKey);
    }

    throw new DecodeError(`Unexpected number of properties: "${propertiesLength}"`);
  }
}
