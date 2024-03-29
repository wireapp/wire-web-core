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
import {DecodeError} from '../errors/DecodeError';
import {CipherMessage} from './CipherMessage';
import {Message} from './Message';
import {PreKeyMessage} from './PreKeyMessage';

export class Envelope {
  readonly _message_enc: Uint8Array;
  readonly message: Message;
  readonly version: number;
  mac: Uint8Array;

  constructor(macKey: MacKey, message: Message, version: number = 1) {
    const serializedMessage = new Uint8Array(message.serialise());
    this.version = version;
    this.mac = MacKey.sign(macKey, serializedMessage);
    this.message = message;
    this._message_enc = serializedMessage;
  }

  /** @param macKey The remote party's MacKey */
  verify(macKey: MacKey): boolean {
    return macKey.verify(this.mac, this._message_enc);
  }

  /** @returns The serialized message envelope */
  serialise(): ArrayBuffer {
    const encoder = new Encoder();
    Envelope.encode(encoder, this);
    return encoder.get_buffer();
  }

  static deserialise(buf: ArrayBuffer): Envelope {
    const decoder = new Decoder(buf);
    return Envelope.decode(decoder);
  }

  static encode(encoder: Encoder, envelope: Envelope): Encoder {
    encoder.object(3);
    encoder.u8(0);
    encoder.u8(envelope.version);

    encoder.u8(1);
    encoder.object(1);
    encoder.u8(0);
    encoder.bytes(envelope.mac);

    encoder.u8(2);
    return encoder.bytes(envelope._message_enc);
  }

  static decode(decoder: Decoder): Envelope {
    const propertiesLength = decoder.object();
    if (propertiesLength === 3) {
      decoder.u8();
      const version = decoder.u8();

      decoder.u8();
      decoder.object();

      decoder.u8();
      const mac = new Uint8Array(decoder.bytes());

      decoder.u8();
      const encodedMessage = new Uint8Array(decoder.bytes());

      const message = Envelope.deserialiseMessage(encodedMessage.buffer);

      const envelope = new Envelope(new MacKey(mac), message, version);
      envelope.mac = mac;
      return envelope;
    }

    throw new DecodeError(`Unexpected number of properties: "${propertiesLength}"`);
  }

  static deserialiseMessage<T extends CipherMessage | PreKeyMessage>(buf: ArrayBuffer): T {
    const decoder = new Decoder(buf);

    switch (decoder.u8()) {
      case 1:
        return CipherMessage.decode(decoder) as T;
      case 2:
        return PreKeyMessage.decode(decoder) as T;
      default:
        throw new DecodeError.InvalidType('Unrecognised message type', DecodeError.CODE.CASE_302);
    }
  }
}
