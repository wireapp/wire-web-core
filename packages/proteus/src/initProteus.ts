/*
 * Wire
 * Copyright (C) 2021 Wire Swiss GmbH
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

import * as sodium from 'libsodium-wrappers-sumo';
import {CSPRNG} from './util/RandomUtil';

export function initProteus(): Promise<void> {
  /* We won't seed here, but just ensure that an instance has been created.
     Seeding will either happen implicitly on the first call to random_bytes(),
     in test cases, or should be triggered from upper layer code, possibly with
     additional external entropy.
   */
  CSPRNG.get_instance();
  return sodium.ready;
}
