/*
 * Wire
 * Copyright (C) 2017 Wire Swiss GmbH
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

import {Cryptobox, store, CryptoboxSession} from '@wireapp/cryptobox';
import * as fs from 'fs-extra';
import {LRUCache} from '@wireapp/lru-cache';
import * as path from 'path';
import {keys as ProteusKeys, init as proteusInit, session as ProteusSession} from '@wireapp/proteus';
import {FileEngine} from '@wireapp/store-engine-fs';

describe('cryptobox.store.CryptoboxCRUDStore', () => {
  const TEMP_DIRECTORY = path.normalize(`${__dirname}/.tmp`);
  let storagePath = '';
  let engine: FileEngine;
  let fileStore: store.CryptoboxCRUDStore;

  beforeAll(async () => {
    await proteusInit();
  });

  beforeEach(async () => {
    await fs.ensureDir(TEMP_DIRECTORY);
    storagePath = fs.mkdtempSync(path.join(TEMP_DIRECTORY, 'test'));
    engine = new FileEngine();

    await engine.init(storagePath, {fileExtension: '.json'});
    const tempCryptobox = new Cryptobox(engine, 1);
    fileStore = tempCryptobox['store'];
  });

  afterEach(() => fs.remove(TEMP_DIRECTORY));

  describe('delete_all"', () => {
    it('deletes everything from the storage', async () => {
      const alicePreKeys = ProteusKeys.PreKey.generate_prekeys(0, 10);

      const aliceIdentity = new ProteusKeys.IdentityKeyPair();
      const bobIdentity = new ProteusKeys.IdentityKeyPair();
      const bobLastResortPreKey = new ProteusKeys.PreKey(ProteusKeys.PreKey.MAX_PREKEY_ID);
      const bobPreKeyBundle = new ProteusKeys.PreKeyBundle(bobIdentity.public_key, bobLastResortPreKey);
      const sessionId = 'my_session_with_bob';

      const sessionWithBob = ProteusSession.Session.init_from_prekey(aliceIdentity, bobPreKeyBundle);
      await Promise.all([
        fileStore.save_identity(aliceIdentity),
        fileStore.save_prekeys(alicePreKeys),
        fileStore.create_session(sessionId, sessionWithBob),
      ]);
      const hasBeenDeleted = await fileStore.delete_all();
      expect(hasBeenDeleted).toBe(true);
    });
  });

  describe('delete_prekey"', () => {
    it('deletes a PreKey', async () => {
      const preKeyId = 0;
      const preKey = new ProteusKeys.PreKey(preKeyId);

      const savedPreKey = await fileStore.save_prekey(preKey);
      expect(savedPreKey.key_id).toBe(preKeyId);

      await fileStore.delete_prekey(preKeyId);
    });
  });

  describe('load_prekey"', () => {
    it('saves and loads a single PreKey', async () => {
      const preKeyId = 0;
      const preKey = new ProteusKeys.PreKey(preKeyId);

      const savedPreKey = await fileStore.save_prekey(preKey);
      expect(savedPreKey.key_id).toBe(preKeyId);
      const loadedPreKey = await fileStore.load_prekey(preKeyId);
      expect(loadedPreKey).toBeDefined();
      expect(loadedPreKey!.key_id).toBe(preKeyId);
    });
  });

  describe('load_prekeys"', () => {
    it('loads multiple PreKeys', async () => {
      await Promise.all([
        fileStore.save_prekey(new ProteusKeys.PreKey(1)),
        fileStore.save_prekey(new ProteusKeys.PreKey(2)),
        fileStore.save_prekey(new ProteusKeys.PreKey(3)),
      ]);
      const preKeys = await fileStore.load_prekeys();
      expect(preKeys).toBeDefined();
    });
  });

  describe('save_identity"', () => {
    it('saves the local identity', async () => {
      const ikp = new ProteusKeys.IdentityKeyPair();
      const identity = await fileStore.save_identity(ikp);
      expect(identity.public_key.fingerprint()).toEqual(ikp.public_key.fingerprint());
    });
  });

  describe('save_prekeys"', () => {
    it('saves multiple PreKeys', async () => {
      const preKeys = [new ProteusKeys.PreKey(0), new ProteusKeys.PreKey(ProteusKeys.PreKey.MAX_PREKEY_ID)];

      const savedPreKeys = await fileStore.save_prekeys(preKeys);
      expect(savedPreKeys.length).toBe(preKeys.length);
    });
  });

  describe('update_session"', () => {
    it('updates an already persisted session', async () => {
      const aliceIdentity = new ProteusKeys.IdentityKeyPair();
      const bobIdentity = new ProteusKeys.IdentityKeyPair();
      const bobLastResortPreKey = new ProteusKeys.PreKey(ProteusKeys.PreKey.MAX_PREKEY_ID);
      const bobPreKeyBundle = new ProteusKeys.PreKeyBundle(bobIdentity.public_key, bobLastResortPreKey);
      const sessionId = 'my_session_with_bob';

      let proteusSession = ProteusSession.Session.init_from_prekey(aliceIdentity, bobPreKeyBundle);
      proteusSession = await fileStore.create_session(sessionId, proteusSession);
      expect(proteusSession.local_identity.public_key.fingerprint()).toBe(aliceIdentity.public_key.fingerprint());
      expect(proteusSession.remote_identity.public_key.fingerprint()).toBe(bobIdentity.public_key.fingerprint());
      expect(proteusSession.version).toBe(1);

      (proteusSession as any).version = 2;
      await fileStore.update_session(sessionId, proteusSession);
      proteusSession = await fileStore.read_session(aliceIdentity, sessionId);
      expect(proteusSession.local_identity.public_key.fingerprint()).toBe(aliceIdentity.public_key.fingerprint());
      expect(proteusSession.remote_identity.public_key.fingerprint()).toBe(bobIdentity.public_key.fingerprint());
      expect(proteusSession.version).toBe(2);
    });
  });

  describe('session_from_prekey"', () => {
    it('saves and caches a valid session from a serialized PreKey bundle', async () => {
      const alice = new Cryptobox(engine, 1);
      const sessionId = 'session_with_bob';

      const bob = new ProteusKeys.IdentityKeyPair();
      const preKey = new ProteusKeys.PreKey(ProteusKeys.PreKey.MAX_PREKEY_ID);
      const bobPreKeyBundle = new ProteusKeys.PreKeyBundle(bob.public_key, preKey);

      const allPreKeys = await alice.create();
      expect(allPreKeys.length).toBe(1);

      let cryptoboxSession: CryptoboxSession = await alice.session_from_prekey(sessionId, bobPreKeyBundle.serialise());
      expect(cryptoboxSession.fingerprint_remote()).toBe(bob.public_key.fingerprint());
      cryptoboxSession = alice['load_session_from_cache'](sessionId)!;
      expect(cryptoboxSession).toBeDefined();
      expect(cryptoboxSession.fingerprint_remote()).toBe(bob.public_key.fingerprint());
      cryptoboxSession = await alice.session_from_prekey(sessionId, bobPreKeyBundle.serialise());
      expect(cryptoboxSession.fingerprint_remote()).toBe(bob.public_key.fingerprint());
    });

    it('reinforces a session from the store without cache', async () => {
      const alice = new Cryptobox(engine, 1);
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
});
