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

export * as derived from './derived/';
export * as errors from './errors/';
export * as keys from './keys/';
export * as message from './message/';
export * as session from './session/';
export * as util from './util/';

import {initProteus} from './initProteus';
import {CSPRNG} from './util/RandomUtil';

export function init(): Promise<void> {
  return initProteus();
}

/**
 * Add entropy to the random number generator. This function should be called before generating
 * long term keys, with a buffer that contains at least as much entropy as the key length to be generated.
 * As defense in depth it will also add entropy from the system secure random number generator.
 * Additionally it's recommended to regularly call this function with external entropy.
 * It MUST be called at least once for every 2**48 operations that require random bytes, such as
 * ratchet key generation, though it's not expected that this limit is ever reached.
 *
 * @param entropy Optional buffer with entropy (random bytes) to be added to the random number generator.
 * It is safe to provide secret data here, such as private keys.
 */
export function add_entropy(entropy?: Uint8Array) {
  CSPRNG.get_instance().seed();
  if (entropy) {
    CSPRNG.get_instance().seed(entropy);
  }
}
