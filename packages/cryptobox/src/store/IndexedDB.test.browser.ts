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

import {IndexedDBEngine} from '@wireapp/store-engine-dexie';
import {v4 as uuidv4} from 'uuid';
import {Cryptobox, store as CryptoboxStore} from '../';
import type {Dexie} from 'dexie';
import {CryptoboxCRUDStore} from './CryptoboxCRUDStore';
import {keys as ProteusKeys, session as ProteusSession} from '@wireapp/proteus';
import {SerialisedRecord} from './SerialisedRecord';
import {LRUCache} from '@wireapp/lru-cache';
import {init} from '@wireapp/proteus';

describe('cryptobox.store.IndexedDB', () => {
  let dexieInstances: Dexie[] = [];

  beforeAll(async () => {
    await init();
  });

  afterEach(async () => {
    await Promise.all(dexieInstances.map(db => deleteDatabase(db)));
    dexieInstances = [];
  });

  function deleteDatabase(db: Dexie): Promise<Event> {
    db.close();
    const dbName = db.name;
    return new Promise((resolve, reject) => {
      const DBDeleteRequest = window.indexedDB.deleteDatabase(dbName);
      DBDeleteRequest.onerror = () => reject(new Error('Error deleting database.'));
      DBDeleteRequest.onsuccess = event => resolve(event);
    });
  }

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

  async function createStore() {
    const dbName = uuidv4();
    const engine = await createEngine(dbName);
    dexieInstances.push(engine['db']);
    return new CryptoboxCRUDStore(engine);
  }

  describe('create_session', () => {
    it('saves a session with meta data', async () => {
      const store = await createStore();

      const alice = new ProteusKeys.IdentityKeyPair();
      const bob = new ProteusKeys.IdentityKeyPair();
      const preKey = new ProteusKeys.PreKey(ProteusKeys.PreKey.MAX_PREKEY_ID);
      const bobPreKeyBundle = new ProteusKeys.PreKeyBundle(bob.public_key, preKey);

      const sessionId = 'session_with_bob';
      const proteusSession = ProteusSession.Session.init_from_prekey(alice, bobPreKeyBundle);
      await store.create_session(sessionId, proteusSession);

      const tableName = CryptoboxStore.CryptoboxCRUDStore.STORES.SESSIONS;
      const serialisedSession = await store['engine'].read<SerialisedRecord>(tableName, sessionId);
      expect(serialisedSession.created).toEqual(jasmine.any(Number));
      expect(serialisedSession.version).toEqual(Cryptobox.VERSION);

      const loadedSession = await store.read_session(alice, sessionId);
      expect(loadedSession.session_tag.tag).toEqual(proteusSession.session_tag.tag);
    });
  });

  describe('update_session', () => {
    it('updates an already persisted session', async () => {
      const store = await createStore();

      const aliceIdentity = new ProteusKeys.IdentityKeyPair();
      const bobIdentity = new ProteusKeys.IdentityKeyPair();
      const bobLastResortPreKey = new ProteusKeys.PreKey(ProteusKeys.PreKey.MAX_PREKEY_ID);
      const bobPreKeyBundle = new ProteusKeys.PreKeyBundle(bobIdentity.public_key, bobLastResortPreKey);
      const sessionId = 'my_session_with_bob';

      let proteusSession = ProteusSession.Session.init_from_prekey(aliceIdentity, bobPreKeyBundle);
      await store.create_session(sessionId, proteusSession);

      expect(proteusSession.local_identity.public_key.fingerprint()).toBe(aliceIdentity.public_key.fingerprint());
      expect(proteusSession.remote_identity.public_key.fingerprint()).toBe(bobIdentity.public_key.fingerprint());
      expect(proteusSession.version).toBe(1);
      (proteusSession as any).version = 2;

      proteusSession = await store.update_session(sessionId, proteusSession);

      expect(proteusSession.local_identity.public_key.fingerprint()).toBe(aliceIdentity.public_key.fingerprint());
      expect(proteusSession.remote_identity.public_key.fingerprint()).toBe(bobIdentity.public_key.fingerprint());
      expect(proteusSession.version).toBe(2);
    });
  });

  describe('session_from_prekey', () => {
    it('saves and caches a valid session from a serialized PreKey bundle', async () => {
      const store = await createStore();

      const alice = new Cryptobox(store['engine'], 1);
      const sessionId = 'session_with_bob';

      const bob = new ProteusKeys.IdentityKeyPair();
      const preKey = new ProteusKeys.PreKey(ProteusKeys.PreKey.MAX_PREKEY_ID);
      const bobPreKeyBundle = new ProteusKeys.PreKeyBundle(bob.public_key, preKey);

      const allPreKeys = await alice.create();
      expect(allPreKeys.length).toBe(1);

      let cryptoboxSession = await alice.session_from_prekey(sessionId, bobPreKeyBundle.serialise());
      expect(cryptoboxSession.fingerprint_remote()).toBe(bob.public_key.fingerprint());

      cryptoboxSession = alice['load_session_from_cache'](sessionId)!;
      expect(cryptoboxSession).toBeDefined();
      expect(cryptoboxSession.fingerprint_remote()).toBe(bob.public_key.fingerprint());

      cryptoboxSession = await alice.session_from_prekey(sessionId, bobPreKeyBundle.serialise());
      expect(cryptoboxSession.fingerprint_remote()).toBe(bob.public_key.fingerprint());
    });

    it('reinforces a session from the indexedDB without cache', async () => {
      const store = await createStore();

      const alice = new Cryptobox(store['engine'], 1);
      const sessionId = 'session_with_bob';

      const bob = new ProteusKeys.IdentityKeyPair();
      const preKey = new ProteusKeys.PreKey(ProteusKeys.PreKey.MAX_PREKEY_ID);
      const bobPreKeyBundle = new ProteusKeys.PreKeyBundle(bob.public_key, preKey);

      const allPreKeys = await alice.create();
      expect(allPreKeys.length).toBe(1);

      let cryptoboxSession = await alice.session_from_prekey(sessionId, bobPreKeyBundle.serialise());
      expect(cryptoboxSession.fingerprint_remote()).toBe(bob.public_key.fingerprint());

      alice['cachedSessions'] = new LRUCache(1);

      cryptoboxSession = await alice.session_from_prekey(sessionId, bobPreKeyBundle.serialise());
      expect(cryptoboxSession.fingerprint_remote()).toBe(bob.public_key.fingerprint());
    });
  });

  describe('refill_prekeys', () => {
    it('publishes refilled PreKeys when a Cryptobox is loaded', async () => {
      const aliceStore = await createStore();
      const alice = new Cryptobox(aliceStore['engine'], 2);

      spyOn<any>(alice, 'publish_prekeys').and.callThrough();

      await alice.create();
      await alice['store'].delete_prekey(0);
      await alice.load();

      expect(alice['publish_prekeys']).toHaveBeenCalledTimes(1);
    });

    it(`doesn't publish refilled PreKeys when a Cryptobox is created`, async () => {
      const store = await createStore();
      const box = new Cryptobox(store['engine'], 2);

      spyOn<any>(box, 'publish_prekeys').and.callThrough();
      await box.create();

      expect(box['publish_prekeys']).toHaveBeenCalledTimes(0);
    });

    it('refills PreKeys after a successful decryption', async () => {
      const aliceStore = await createStore();
      const alice = new Cryptobox(aliceStore['engine'], 10);

      spyOn<any>(alice, 'refill_prekeys').and.callThrough();
      expect(alice['refill_prekeys']).toHaveBeenCalledTimes(0);

      const alicePreKeys = await alice.create();
      expect(alicePreKeys.length).toBe(10);

      expect(alicePreKeys[9].key_id).toBe(ProteusKeys.PreKey.MAX_PREKEY_ID);
      expect(alice['refill_prekeys']).toHaveBeenCalledTimes(1);

      const bobStore = await createStore();
      const bob = new Cryptobox(bobStore['engine'], 7);

      spyOn<any>(bob, 'refill_prekeys').and.callThrough();
      expect(bob['refill_prekeys']).toHaveBeenCalledTimes(0);

      const bobPreKeys = await bob.create();

      expect(bobPreKeys.length).toBe(7);
      expect(bob['refill_prekeys']).toHaveBeenCalledTimes(1);

      const sessionId = 'session_with_bob';
      const preKey = await bob['store'].load_prekey(3);

      expect(bob['identity']).toBeDefined();
      expect(preKey).toBeDefined();
      const bobBundle = new ProteusKeys.PreKeyBundle(bob['identity']!.public_key, preKey!);

      const cipherMessage = await alice.encrypt(sessionId, 'Hello Bob!', bobBundle.serialise());
      expect((await bob['store'].load_prekeys()).length).toBe(7);

      expect(alice['refill_prekeys']).toHaveBeenCalledTimes(1);
      expect(bob['refill_prekeys']).toHaveBeenCalledTimes(1);

      expect((await bob['store'].load_prekeys()).map(pk => pk.key_id)).toEqual([0, 1, 2, 3, 4, 5, 65535]);

      await bob.decrypt(sessionId, cipherMessage);
      expect(bob['refill_prekeys']).toHaveBeenCalledTimes(2);

      expect((await bob['store'].load_prekeys()).length).toBe(7);
      expect((await bob['store'].load_prekeys()).map(pk => pk.key_id)).toEqual([0, 1, 2, 4, 5, 6, 65535]);
    });
  });
});
