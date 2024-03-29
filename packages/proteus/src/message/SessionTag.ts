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
import * as sodium from 'libsodium-wrappers-sumo';
import {DecodeError} from '../errors/DecodeError';
import {random_bytes} from '../util/RandomUtil';

export class SessionTag {
  private static readonly randomBytesLength = 16;
  readonly tag: Uint8Array;

  constructor(tag?: Uint8Array) {
    this.tag = tag || random_bytes(SessionTag.randomBytesLength);
  }

  toString(): string {
    return sodium.to_hex(this.tag);
  }

  static encode(encoder: Encoder, sessionTag: SessionTag): Encoder {
    return encoder.bytes(sessionTag.tag);
  }

  static decode(decoder: Decoder): SessionTag {
    const length = 16;

    const bytes = new Uint8Array(decoder.bytes());
    if (bytes.byteLength !== length) {
      throw new DecodeError.InvalidArrayLen(
        `Session tag should be 16 bytes, not ${bytes.byteLength} bytes.`,
        DecodeError.CODE.CASE_303,
      );
    }

    return new SessionTag(new Uint8Array(bytes));
  }
}
