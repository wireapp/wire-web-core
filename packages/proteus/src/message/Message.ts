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

export abstract class Message {
  constructor() {}

  abstract serialise(): ArrayBuffer;

  // static deserialise<T extends CipherMessage | PreKeyMessage>(buf: ArrayBuffer): T {
  //   const decoder = new Decoder(buf);
  //
  //   switch (decoder.u8()) {
  //     case 1:
  //       return CipherMessage.decode(decoder) as T;
  //     case 2:
  //       return PreKeyMessage.decode(decoder) as T;
  //     default:
  //       throw new DecodeError.InvalidType('Unrecognised message type', DecodeError.CODE.CASE_302);
  //   }
  // }
}

// these import statements have to come after the Message definition because otherwise
// it creates a circular dependency with the message subtypes
// import {CipherMessage} from './CipherMessage';
// import {PreKeyMessage} from './PreKeyMessage';
