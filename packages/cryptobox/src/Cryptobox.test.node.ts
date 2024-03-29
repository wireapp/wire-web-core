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

import bazinga64 from 'bazinga64';
import {errors as ProteusErrors, keys as ProteusKeys} from '@wireapp/proteus';
import {Cryptobox} from '@wireapp/cryptobox';
import {MemoryEngine} from '@wireapp/store-engine';
import event from './test/fixtures/qa-break-session/event.json';
import cryptobox from './test/fixtures/qa-break-session/cryptobox.json';

describe('Cryptobox', () => {
  async function createCryptobox(storeName: string, amountOfPreKeys: number = 1): Promise<Cryptobox> {
    const engine = new MemoryEngine();
    await engine.init(storeName);
    return new Cryptobox(engine, amountOfPreKeys);
  }

  describe('encrypt / decrypt', () => {
    it('encrypts messages for multiple clients and decrypts', async () => {
      const alice = await createCryptobox('alice');
      const text = 'Hello, World!';

      await alice.create();

      const bob = await createCryptobox('bob', 2);
      await bob.create();

      const eve = await createCryptobox('eve', 2);
      await eve.create();

      const mallory = await createCryptobox('mallory', 2);
      await mallory.create();

      const bobPreKey = await bob['store'].load_prekey(0);
      const evePreKey = await eve['store'].load_prekey(0);
      const malloryPreKey = await mallory['store'].load_prekey(0);

      expect(bob.getIdentity()).toBeDefined();
      expect(bobPreKey).toBeDefined();
      const bobBundle = new ProteusKeys.PreKeyBundle(bob.getIdentity().public_key, bobPreKey!);

      expect(eve.getIdentity()).toBeDefined();
      expect(evePreKey).toBeDefined();
      const eveBundle = new ProteusKeys.PreKeyBundle(eve.getIdentity().public_key, evePreKey!);

      expect(mallory.getIdentity()).toBeDefined();
      expect(malloryPreKey).toBeDefined();
      const malloryBundle = new ProteusKeys.PreKeyBundle(mallory.getIdentity().public_key, malloryPreKey!);

      const [bobPayload, evePayload, malloryPayload] = await Promise.all([
        alice.encrypt('session-with-bob', text, bobBundle.serialise()),
        alice.encrypt('session-with-eve', text, eveBundle.serialise()),
        alice.encrypt('session-with-mallory', text, malloryBundle.serialise()),
      ]);

      const bobDecrypted = await bob.decrypt('session-with-alice', bobPayload);
      expect(Buffer.from(bobDecrypted).toString('utf8')).toBe(text);

      const eveDecrypted = await eve.decrypt('session-with-alice', evePayload);
      expect(Buffer.from(eveDecrypted).toString('utf8')).toBe(text);

      const malloryDecrypted = await mallory.decrypt('session-with-alice', malloryPayload);
      expect(Buffer.from(malloryDecrypted).toString('utf8')).toBe(text);
    });

    it("throws an error when receiving a PreKey message that was encoded with a PreKey which does not exist anymore on the receiver's side", async () => {
      const sessionId = `${event.from}@${event.data.sender}`;
      const amountOfAlicePreKeys = Object.keys(cryptobox.prekeys).length;
      const alice = await createCryptobox('alice', amountOfAlicePreKeys);
      await alice.create();
      await alice.deserialize(cryptobox);

      const ciphertext = bazinga64.Decoder.fromBase64(event.data.text).asBytes;

      try {
        await alice.decrypt(sessionId, ciphertext.buffer);
        fail();
      } catch (error) {
        expect((error as ProteusErrors.ProteusError).code).toBe(ProteusErrors.ProteusError.CODE.CASE_101);
      }
    });
  });

  describe('serialize / deserialize', () => {
    it('can be used to export and import Cryptobox instances', async () => {
      // Test serialization
      const amountOfAlicePreKeys = 15;
      const alice = await createCryptobox('alice', amountOfAlicePreKeys);
      await alice.create();
      let serializedAlice = await alice.serialize();

      expect(Object.keys(serializedAlice.prekeys).length).toBe(amountOfAlicePreKeys);
      expect(Object.keys(serializedAlice.sessions).length).toBe(0);

      // Test serialization with sessions
      const bob = await createCryptobox('bob', 2);
      await bob.create();

      const bobPreKey = await bob['store'].load_prekey(0);

      expect(bob.getIdentity()).toBeDefined();
      expect(bobPreKey).toBeDefined();
      const bobBundle = new ProteusKeys.PreKeyBundle(bob.getIdentity().public_key, bobPreKey!);
      const sessionName = 'alice-to-bob';
      await alice.encrypt(sessionName, 'Hello Bob. This is Alice.', bobBundle.serialise());

      serializedAlice = await alice.serialize();

      expect(Object.keys(serializedAlice.prekeys).length).toBe(amountOfAlicePreKeys);
      expect(Object.keys(serializedAlice.sessions).length).toBe(1);

      const eve = await createCryptobox('eve', 5);
      await eve.create();

      const alicePreKey = await alice['store'].load_prekey(0);

      expect(alice.getIdentity()).toBeDefined();
      expect(alicePreKey).toBeDefined();
      const aliceBundle = new ProteusKeys.PreKeyBundle(alice.getIdentity().public_key, alicePreKey!);

      const cipherText = await eve.encrypt('eve-to-alice', 'Hello Alice. This is Eve.', aliceBundle.serialise());
      await alice.decrypt('alice-to-eve', cipherText);

      serializedAlice = await alice.serialize();

      const expectedSessionsOfAlice = 2;
      expect(Object.keys(serializedAlice.prekeys).length).toBe(amountOfAlicePreKeys);
      expect(Object.keys(serializedAlice.sessions).length).toBe(expectedSessionsOfAlice);

      expect(eve.getIdentity()).toBeDefined();

      // Test that Alice and Eve are NOT the same
      const aliceId = alice.getIdentity().public_key.fingerprint();
      let eveId = eve.getIdentity().public_key.fingerprint();
      expect(aliceId).not.toBe(eveId);

      // Test that Eve can import Alice's Identity
      await eve.deserialize(serializedAlice);
      eveId = eve.getIdentity().public_key.fingerprint();
      expect(aliceId).toBe(eveId);

      // Test that Eve can import Alice's PreKeys
      const evePreKeys = await eve['store'].load_prekeys();
      expect(eve.lastResortPreKey).toBeDefined();
      expect(evePreKeys.length).toBe(amountOfAlicePreKeys);

      // Test that Eve can import Alice's Sessions
      const eveSessions = await eve['store'].read_sessions(eve.getIdentity());
      expect(Object.keys(eveSessions).length).toBe(expectedSessionsOfAlice);

      // Test that Eve's Cryptobox can be serialized
      const serializedEve = await eve.serialize();
      expect(Object.keys(serializedEve.prekeys).length).toBe(amountOfAlicePreKeys);

      // Test that Eve can write to Bob because Alice had a session with Bob
      const messageEveToBob = 'Hello Bob, I am your new Alice. ;)';
      const encrypted = await eve.encrypt(sessionName, messageEveToBob);
      const decrypted = await bob.decrypt('bob-to-alice', encrypted);
      expect(Buffer.from(decrypted).toString('utf8')).toBe(messageEveToBob);
    });
  });
});
