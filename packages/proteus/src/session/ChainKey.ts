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
import {DerivedSecrets} from '../derived/DerivedSecrets';
import {MacKey} from '../derived/MacKey';
import {DecodeError} from '../errors/DecodeError';
import {MessageKeys} from './MessageKeys';

export class ChainKey {
  readonly idx: number;
  readonly key: MacKey;
  private static readonly propertiesLength = 2;

  constructor(key: MacKey, index: number = -1) {
    this.idx = index;
    this.key = key;
  }

  static from_mac_key(key: MacKey, counter: number): ChainKey {
    return new ChainKey(key, counter);
  }

  static next(chainKey: ChainKey): ChainKey {
    const key = new MacKey(MacKey.sign(chainKey.key, '1'));
    const index = chainKey.idx + 1;
    return new ChainKey(key, index);
  }

  static message_keys(chainKey: ChainKey): MessageKeys {
    const base = MacKey.sign(chainKey.key, '0');
    const derivedSecrets = DerivedSecrets.kdf_without_salt(base, 'hash_ratchet');
    return new MessageKeys(derivedSecrets.cipher_key, derivedSecrets.mac_key, chainKey.idx);
  }

  static encode(encoder: Encoder, chainKey: ChainKey): Encoder {
    encoder.object(ChainKey.propertiesLength);
    encoder.u8(0);
    MacKey.encode(encoder, chainKey.key);
    encoder.u8(1);
    return encoder.u32(chainKey.idx);
  }

  static decode(decoder: Decoder): ChainKey {
    const propertiesLength = decoder.object();
    if (propertiesLength === ChainKey.propertiesLength) {
      decoder.u8();
      const key = MacKey.decode(decoder);

      decoder.u8();
      const index = decoder.u32();

      return new ChainKey(key, index);
    }

    throw new DecodeError(`Unexpected number of properties: "${propertiesLength}"`);
  }
}
