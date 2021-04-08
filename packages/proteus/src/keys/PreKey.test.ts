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

import * as sodium from 'libsodium-wrappers-sumo';
import {PreKey} from '../keys';
import {init} from '@wireapp/proteus';

beforeAll(async () => {
  await init();
});

describe('PreKey', () => {
  describe('Generation', () => {
    it('generates a PreKey', () => {
      const key_id = 0;
      const preKey = PreKey.new(key_id);
      expect(preKey.key_id).toBe(key_id);
    });

    it('generates a PreKey of last resort', async () => {
      const preKey = await PreKey.last_resort();
      expect(preKey.key_id).toBe(PreKey.MAX_PREKEY_ID);
    });

    it('generates ranges of PreKeys', async () => {
      let prekeys = PreKey.generate_prekeys(0, 0);
      expect(prekeys.length).toBe(0);

      prekeys = PreKey.generate_prekeys(0, 1);
      expect(prekeys.length).toBe(1);
      expect(prekeys[0].key_id).toBe(0);

      prekeys = PreKey.generate_prekeys(0, 10);
      expect(prekeys.length).toBe(10);
      expect(prekeys[0].key_id).toBe(0);
      expect(prekeys[9].key_id).toBe(9);

      prekeys = PreKey.generate_prekeys(3000, 10);
      expect(prekeys.length).toBe(10);
      expect(prekeys[0].key_id).toBe(3000);
      expect(prekeys[9].key_id).toBe(3009);
    });

    it('does not include the last resort PreKey', async () => {
      let prekeys = PreKey.generate_prekeys(65530, 10);
      expect(prekeys.length).toBe(10);
      expect(prekeys[0].key_id).toBe(65530);
      expect(prekeys[1].key_id).toBe(65531);
      expect(prekeys[2].key_id).toBe(65532);
      expect(prekeys[3].key_id).toBe(65533);
      expect(prekeys[4].key_id).toBe(65534);
      expect(prekeys[5].key_id).toBe(0);
      expect(prekeys[6].key_id).toBe(1);
      expect(prekeys[7].key_id).toBe(2);
      expect(prekeys[8].key_id).toBe(3);
      expect(prekeys[9].key_id).toBe(4);

      prekeys = PreKey.generate_prekeys(PreKey.MAX_PREKEY_ID, 1);
      expect(prekeys.length).toBe(1);
      expect(prekeys[0].key_id).toBe(0);
    });
  });

  describe('Serialisation', () => {
    it('serialises and deserialises correctly', async () => {
      const pk = PreKey.new(0);
      const pk_bytes = pk.serialise();
      const pk_copy = PreKey.deserialise(pk_bytes);

      expect(pk_copy.version).toBe(pk.version);
      expect(pk_copy.key_id).toBe(pk.key_id);
      expect(pk_copy.key_pair.public_key.fingerprint()).toBe(pk.key_pair.public_key.fingerprint());
      expect(sodium.to_hex(new Uint8Array(pk_bytes))).toBe(sodium.to_hex(new Uint8Array(pk_copy.serialise())));
    });
  });
});
