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

import {Cryptobox, CryptoboxSession, error as errors} from '../';
import {
  errors as ProteusErrors,
  init as proteusInit,
  keys as ProteusKeys,
  session as ProteusSession,
} from '@wireapp/proteus';
import {MemoryEngine} from '@wireapp/store-engine';
import * as sodium from 'libsodium-wrappers-sumo';

describe('cryptobox.Cryptobox', () => {
  let engine: MemoryEngine;

  async function createCryptobox(storeName: string, amountOfPreKeys: number = 1): Promise<Cryptobox> {
    const memoryEngine = new MemoryEngine();
    await memoryEngine.init(storeName);
    return new Cryptobox(memoryEngine, amountOfPreKeys);
  }

  beforeAll(async () => {
    await proteusInit();
  });

  beforeEach(async () => {
    engine = new MemoryEngine();
    await engine.init('cache');
  });

  describe('decrypt', () => {
    
    // This test conforms to the following testing standards:
    // @SF.Messages @TSFI.RESTfulAPI @S0.2 @S0.3
    it("doesn't decrypt empty ArrayBuffers", async () => {
      const box = new Cryptobox(engine);
      const sessionId = 'sessionWithBob';
      try {
        await box.decrypt(sessionId, new ArrayBuffer(0));
        fail();
      } catch (error) {
        expect(error).toEqual(jasmine.any(errors.DecryptionError));
      }
    });
  
    // This test conforms to the following testing standards:
    // @SF.Messages @TSFI.RESTfulAPI @S0.2 @S0.3
    it('throws a Proteus decryption error if you try to decrypt the same message twice', async () => {
      const alice = await createCryptobox('alice');
      await alice.create();

      const bob = await createCryptobox('bob');
      const bobsPreKeys = await bob.create();

      expect(bob.getIdentity()).toBeDefined();
      const bobBundle = new ProteusKeys.PreKeyBundle(bob.getIdentity().public_key, bobsPreKeys[0]);

      const plaintext = 'Hello, Bob!';
      const ciphertext = await alice.encrypt('session-with-bob', plaintext, bobBundle.serialise());

      const decrypted = await bob.decrypt('session-with-alice', ciphertext);
      const decryptedText = sodium.to_string(decrypted);

      expect(decryptedText).toBe(plaintext);

      try {
        await bob.decrypt('session-with-alice', ciphertext);
        fail();
      } catch (error) {
        expect(error).toEqual(jasmine.any(ProteusErrors.DecryptError.DuplicateMessage));
        expect((error as ProteusErrors.DecryptError).code).toBe(ProteusErrors.DecryptError.CODE.CASE_209);
      }
    });
  });

  describe('create', () => {
    it('initializes a Cryptobox with a new identity and the last resort PreKey and saves these', async () => {
      const box = new Cryptobox(engine);

      await box.create();
      expect(box.getIdentity()).toBeDefined();

      const identity = await box['store'].load_identity();
      expect(identity).toBeDefined();
      expect(identity!.public_key.fingerprint()).toBeDefined();

      const preKey = await box['store'].load_prekey(ProteusKeys.PreKey.MAX_PREKEY_ID);
      expect(preKey).toBeDefined();
      expect(preKey!.key_id).toBe(ProteusKeys.PreKey.MAX_PREKEY_ID);
    });

    it('initializes a Cryptobox with a defined amount of PreKeys (including the last resort PreKey)', async () => {
      const box = new Cryptobox(engine, 10);
      await box.create();
      const preKeys = await box['store'].load_prekeys();
      const lastResortPreKey = preKeys.filter(preKey => preKey.key_id === ProteusKeys.PreKey.MAX_PREKEY_ID);
      expect(preKeys.length).toBe(10);
      expect(box.lastResortPreKey).toBeDefined();
      expect(box.lastResortPreKey).toEqual(lastResortPreKey[0]);
    });

    it('returns the current version', () => {
      expect(Cryptobox.VERSION).toBeDefined();
    });
  });

  describe('load', () => {
    it('initializes a Cryptobox with an existing identity and the last resort PreKey', async () => {
      let box = new Cryptobox(engine, 4);

      const initialPreKeys = await box.create();
      const lastResortPreKey = initialPreKeys[initialPreKeys.length - 1];
      expect(lastResortPreKey.key_id).toBe(ProteusKeys.PreKey.MAX_PREKEY_ID);

      const identity = box.getIdentity();
      expect(identity).toBeDefined();
      expect(identity.public_key.fingerprint()).toBeDefined();

      const initialFingerPrint = identity.public_key.fingerprint();

      box = new Cryptobox(engine);
      expect(box['identity']).not.toBeDefined();
      await box.load();
      expect(box['identity']).toBeDefined();
      expect(box.getIdentity().public_key.fingerprint()).toBe(initialFingerPrint);
    });
    
    // This test conforms to the following testing standards:
    // @SF.Messages @TSFI.RESTfulAPI @S0.2 @S0.3
    it('fails to initialize a Cryptobox of which the identity is missing', async () => {
      let box = new Cryptobox(engine);

      try {
        await box.create();
        expect(box.getIdentity()).toBeDefined();
        await box['store'].delete_all();

        const identity = await box['store'].load_identity();
        expect(identity).not.toBeDefined();

        box = new Cryptobox(engine);
        expect(box.getIdentity()).not.toBeDefined();
        await box.load();
        fail();
      } catch (error) {
        expect(error).toEqual(jasmine.any(errors.CryptoboxError));
      }
    });
    
    // This test conforms to the following testing standards:
    // @SF.Messages @TSFI.RESTfulAPI @S0.2 @S0.3
    it('fails to initialize a Cryptobox of which the last resort PreKey is missing', async () => {
      let box = new Cryptobox(engine);

      try {
        await box.create();
        expect(box.getIdentity()).toBeDefined();
        await box['store'].delete_prekey(ProteusKeys.PreKey.MAX_PREKEY_ID);

        const prekey = await box['store'].load_prekey(ProteusKeys.PreKey.MAX_PREKEY_ID);
        expect(prekey).not.toBeDefined();

        box = new Cryptobox(engine);
        expect(box.getIdentity()).not.toBeDefined();
        await box.load();
        fail();
      } catch (error) {
        expect(error).toEqual(jasmine.any(errors.CryptoboxError));
      }
    });
  });

  describe('PreKeys', () => {
    describe('serialize_prekey', () => {
      it('generates a JSON format', async () => {
        const box = new Cryptobox(engine, 10);
        box['identity'] = new ProteusKeys.IdentityKeyPair();
        const preKeyId = 72;
        const preKey = new ProteusKeys.PreKey(preKeyId);
        const json = box.serialize_prekey(preKey);
        expect(json.id).toBe(preKeyId);
        const decodedPreKeyBundleBuffer = sodium.from_base64(json.key, sodium.base64_variants.ORIGINAL).buffer;
        expect(decodedPreKeyBundleBuffer).toBeDefined();
      });
    });
  });

  describe('Sessions', () => {
    let box: Cryptobox;
    const sessionIdUnique = 'unique_identifier';

    beforeEach(async () => {
      box = new Cryptobox(engine);
      await box.create();

      const bobIdentity = new ProteusKeys.IdentityKeyPair();
      const bobPrekey = new ProteusKeys.PreKey(ProteusKeys.PreKey.MAX_PREKEY_ID);

      const bobBundle = new ProteusKeys.PreKeyBundle(bobIdentity.public_key, bobPrekey);

      expect(box.getIdentity()).toBeDefined();
      const session = ProteusSession.Session.init_from_prekey(box.getIdentity()!, bobBundle);
      const cryptoBoxSession = new CryptoboxSession(sessionIdUnique, session);
      await box['session_save'](cryptoBoxSession);
    });

    describe('session_from_prekey', () => {
      it('creates a session from a valid PreKey format', async () => {
        const remotePreKey = {
          id: 65535,
          key: 'pQABARn//wKhAFggY/Yre8URI2xF93otjO7pUJ3ZjP4aM+sNJb6pL6J+iYgDoQChAFggZ049puHgS2zw8wjJorpl+EG9/op9qEOANG7ecEU2hfwE9g==',
        };
        const sessionId = 'session_id';
        const decodedPreKeyBundleBuffer = sodium.from_base64(remotePreKey.key, sodium.base64_variants.ORIGINAL).buffer;

        const session = await box.session_from_prekey(sessionId, decodedPreKeyBundleBuffer);
        expect(session.id).toBe(sessionId);
      });
      
      // This test conforms to the following testing standards:
      // @SF.Messages @TSFI.RESTfulAPI @S0.2 @S0.3
      it('fails for outdated PreKey formats', async () => {
        const remotePreKey = {
          id: 65535,
          key: 'hAEZ//9YIOxZw78oQCH6xKyAI7WqagtbvRZ/LaujG+T790hOTbf7WCDqAE5Dc75VfmYji6wEz976hJ2hYuODYE6pA59DNFn/KQ==',
        };
        const sessionId = 'session_id';
        const decodedPreKeyBundleBuffer = sodium.from_base64(remotePreKey.key, sodium.base64_variants.ORIGINAL).buffer;

        try {
          await box.session_from_prekey(sessionId, decodedPreKeyBundleBuffer);
          fail();
        } catch (error) {
          expect(error instanceof errors.InvalidPreKeyFormatError).toBe(true);
        }
      });
    });

    describe('session_load', () => {
      it('loads a session from the cache', async () => {
        spyOn<any>(box, 'load_session_from_cache').and.callThrough();
        spyOn(box['store'], 'read_session').and.callThrough();

        const session = await box.session_load(sessionIdUnique);

        expect(session.id).toBe(sessionIdUnique);
        expect(box['load_session_from_cache']).toHaveBeenCalledTimes(1);
      });
    });

    describe('encrypt', () => {
      it('saves the session after successful encryption', async () => {
        spyOn(box['store'], 'update_session').and.callThrough();
        const encryptedBuffer = await box.encrypt(sessionIdUnique, 'Hello World.');

        expect(encryptedBuffer).toBeDefined();
        expect(box['store'].update_session).toHaveBeenCalledTimes(1);
      });
    });
  });
});
