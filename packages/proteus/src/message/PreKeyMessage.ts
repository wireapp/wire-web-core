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
import {DecodeError} from '../errors/DecodeError';
import {InputError} from '../errors/InputError';
import {IdentityKey} from '../keys/IdentityKey';
import {PublicKey} from '../keys/PublicKey';
import {CipherMessage} from './CipherMessage';
import {Message} from './Message';

export class PreKeyMessage extends Message {
  readonly base_key: PublicKey;
  readonly identity_key: IdentityKey;
  readonly message: CipherMessage;
  readonly prekey_id: number;
  private static readonly propertiesLength = 4;

  constructor(prekeyId: number, baseKey: PublicKey, identityKey: IdentityKey, message: CipherMessage) {
    super();
    this.prekey_id = prekeyId;
    this.base_key = baseKey;
    this.identity_key = identityKey;
    this.message = message;
  }

  static encode(encoder: Encoder, preKeyMessage: PreKeyMessage): Encoder {
    encoder.object(PreKeyMessage.propertiesLength);
    encoder.u8(0);
    encoder.u16(preKeyMessage.prekey_id);
    encoder.u8(1);
    PublicKey.encode(encoder, preKeyMessage.base_key);
    encoder.u8(2);
    IdentityKey.encode(encoder, preKeyMessage.identity_key);
    encoder.u8(3);
    return CipherMessage.encode(encoder, preKeyMessage.message);
  }

  serialise(): ArrayBuffer {
    const encoder = new Encoder();
    encoder.u8(2);
    PreKeyMessage.encode(encoder, this);
    return encoder.get_buffer();
  }

  static decode(decoder: Decoder): PreKeyMessage {
    const propertiesLength = decoder.object();
    if (propertiesLength === PreKeyMessage.propertiesLength) {
      decoder.u8();
      const prekeyId = Number(decoder.u16());

      decoder.u8();
      const baseKey = PublicKey.decode(decoder);

      decoder.u8();
      const identityKey = IdentityKey.decode(decoder);

      decoder.u8();
      const message = CipherMessage.decode(decoder);

      if (!isNaN(prekeyId) && baseKey && identityKey && message) {
        return new PreKeyMessage(prekeyId, baseKey, identityKey, message);
      }
      throw new InputError.TypeError(`Given PreKeyMessage doesn't match expected signature.`, InputError.CODE.CASE_406);
    }
    throw new DecodeError(`Unexpected number of properties: "${propertiesLength}"`);
  }
}
