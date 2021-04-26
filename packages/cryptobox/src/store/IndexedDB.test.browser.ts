/*
 * Wire
 * Copyright (C) 2016 Wire Swiss GmbH
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

/* eslint no-magic-numbers: "off" */

import {init} from "@wireapp/proteus";
import {IndexedDBEngine} from "@wireapp/store-engine-dexie";

describe('cryptobox.store.IndexedDB', () => {
  beforeAll(async () => {
    await init();
  });

  async function createEngine(storeName: string): Promise<IndexedDBEngine> {
    const engine = new IndexedDBEngine();
    await engine.init(storeName);
    engine['db'].version(1).stores({
      keys: '',
      prekeys: '',
      sessions: '',
    });
    return engine;
  }

  describe('create_session', () => {
    it('saves a session with meta data', async () => {
      const store = await createEngine('A');
      expect(store).toBeDefined();
    });
  });
});
