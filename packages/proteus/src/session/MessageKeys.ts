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
import {MacKey} from '../derived/MacKey';
import {CipherKey} from '../derived/CipherKey';
import {DecodeError} from '../errors/DecodeError';

export class MessageKeys {
  readonly cipher_key: CipherKey;
  readonly counter: number;
  readonly mac_key: MacKey;
  private static readonly propertiesLength = 3;

  constructor(cipherKey: CipherKey, macKey: MacKey, counter: number) {
    this.cipher_key = cipherKey;
    this.mac_key = macKey;
    this.counter = counter;
  }

  private _counter_as_nonce(): Uint8Array {
    const nonce = new ArrayBuffer(8);
    new DataView(nonce).setUint32(0, this.counter);
    return new Uint8Array(nonce);
  }

  encrypt(plaintext: string | Uint8Array): Uint8Array {
    return this.cipher_key.encrypt(plaintext, this._counter_as_nonce());
  }

  decrypt(ciphertext: Uint8Array): Uint8Array {
    return this.cipher_key.decrypt(ciphertext, this._counter_as_nonce());
  }

  static encode(encoder: Encoder, messageKeys: MessageKeys): Encoder {
    encoder.object(MessageKeys.propertiesLength);
    encoder.u8(0);
    CipherKey.encode(encoder, messageKeys.cipher_key);
    encoder.u8(1);
    MacKey.encode(encoder, messageKeys.mac_key);
    encoder.u8(2);
    return encoder.u32(messageKeys.counter);
  }

  static decode(decoder: Decoder): MessageKeys {
    const propertiesLength = decoder.object();
    if (propertiesLength === MessageKeys.propertiesLength) {
      decoder.u8();
      const cipherKey = CipherKey.decode(decoder);

      decoder.u8();
      const macKey = MacKey.decode(decoder);

      decoder.u8();
      const counter = decoder.u32();

      return new MessageKeys(cipherKey, macKey, counter);
    }

    throw new DecodeError(`Unexpected number of properties: "${propertiesLength}"`);
  }
}
