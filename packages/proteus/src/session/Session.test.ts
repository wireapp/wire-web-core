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
import { PreKey } from '../keys/PreKey';
import { PreKeyStore } from './PreKeyStore';
import { Session } from './Session';
import {IdentityKeyPair} from "../keys/IdentityKeyPair";
import { Envelope } from '../message/Envelope';
import { PreKeyBundle } from '../keys/PreKeyBundle';
import { CipherMessage } from '../message/CipherMessage';
import { DecryptError } from '../errors/DecryptError';
import { ProteusError } from '../errors/ProteusError';
import {initProteus} from "../initProteus";

class SimplePreKeyStore implements PreKeyStore {
  readonly prekeys: Map<number, ArrayBuffer> = new Map();

  constructor(readonly identifier: string, preKeys: PreKey[]) {
    preKeys.forEach(preKey => {
      this.prekeys.set(preKey.key_id, preKey.serialise());
    });
  }

  async load_prekey(preKeyId: number): Promise<PreKey> {
    const ab = this.prekeys.get(preKeyId);
    if (ab) {
      return PreKey.deserialise(ab);
    }
    throw new Error(`PreKey ID "${preKeyId}" not found.`);
  }

  async delete_prekey(prekeyId: number): Promise<number> {
    this.prekeys.delete(prekeyId);
    return prekeyId;
  }
}

const assert_serialise_deserialise = (localIdentity: IdentityKeyPair, session: Session): void => {
  const bytes = session.serialise();

  const deser = Session.deserialise(localIdentity, bytes);
  const deser_bytes = deser.serialise();

  expect(sodium.to_hex(new Uint8Array(bytes))).toEqual(sodium.to_hex(new Uint8Array(deser_bytes)));
};

const assert_init_from_message = async (
  identity: IdentityKeyPair,
  store: PreKeyStore,
  envelope: Envelope,
  expected: string,
): Promise<Session> => {
  const [session, message] = await Session.init_from_message(identity, store, envelope);
  expect(sodium.to_string(message)).toBe(expected);
  return session;
};

beforeAll(async () => {
  await initProteus();
});

describe('Session', () => {
  describe('Setup', () => {
    it('generates a session from a prekey message', async () => {
      const preKeys = PreKey.generate_prekeys(0, 10);
      const bobStore = new SimplePreKeyStore('bobStore', preKeys);

      const alice = new IdentityKeyPair();
      const bob = new IdentityKeyPair();
      const bobPreKey = await bobStore.load_prekey(0);
      const bobPreKeyBundle = new PreKeyBundle(bob.public_key, bobPreKey!);
      const aliceToBob = Session.init_from_prekey(alice, bobPreKeyBundle);

      const plaintext = 'Hello Bob!';

      const preKeyMessage = Session.encrypt(aliceToBob, plaintext);

      const envelope = Envelope.deserialise(preKeyMessage.serialise());

      const [bobToAlice, decrypted] = await Session.init_from_message(bob, bobStore, envelope);

      expect(sodium.to_string(decrypted)).toBe(plaintext);
      expect(bobToAlice).toBeDefined();
    });
  });

  describe('Serialisation', () => {
    it('can be serialised and deserialized to/from CBOR', async () => {
      const [alice_ident, bob_ident] = [new IdentityKeyPair(), new IdentityKeyPair()];
      const bob_store = new SimplePreKeyStore('bobStore', PreKey.generate_prekeys(0, 10));

      const bob_prekey = await bob_store.load_prekey(0);
      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      const alice = Session.init_from_prekey(alice_ident, bob_bundle);
      expect(alice.session_states[alice.session_tag.toString()].state.recv_chains.length).toEqual(1);
      expect(alice.pending_prekey!.length).toBe(2);

      assert_serialise_deserialise(alice_ident, alice);
    });

    it('encrypts and decrypts messages', async () => {
      const alice_ident = new IdentityKeyPair();
      const alice_store = new SimplePreKeyStore('alice_store', PreKey.generate_prekeys(0, 10));

      const bob_ident = new IdentityKeyPair();
      const bob_store = new SimplePreKeyStore('bob_store', PreKey.generate_prekeys(0, 10));

      const bob_prekey = await bob_store.load_prekey(0);
      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      const alice = Session.init_from_prekey(alice_ident, bob_bundle);
      expect(alice.session_states[alice.session_tag.toString()].state.recv_chains.length).toBe(1);

      const hello_bob = Session.encrypt(alice, 'Hello Bob!');
      const hello_bob_delayed = Session.encrypt(alice, 'Hello delay!');

      expect(Object.keys(alice.session_states).length).toBe(1);
      expect(alice.session_states[alice.session_tag.toString()].state.recv_chains.length).toBe(1);

      const bob = await assert_init_from_message(bob_ident, bob_store, hello_bob, 'Hello Bob!');

      expect(Object.keys(bob.session_states).length).toBe(1);
      expect(bob.session_states[bob.session_tag.toString()].state.recv_chains.length).toBe(1);

      const hello_alice = Session.encrypt(bob, 'Hello Alice!');

      expect(alice.pending_prekey!.length).toBe(2);

      expect(sodium.to_string(await alice.decrypt(alice_store, hello_alice))).toBe('Hello Alice!');

      expect(alice.pending_prekey).toBe(null);
      expect(alice.session_states[alice.session_tag.toString()].state.recv_chains.length).toBe(2);
      expect(alice.remote_identity.fingerprint()).toBe(bob.local_identity.public_key.fingerprint());

      const ping_bob_1 = Session.encrypt(alice, 'Ping1!');
      const ping_bob_2 = Session.encrypt(alice, 'Ping2!');

      expect(alice.session_states[alice.session_tag.toString()].state.prev_counter).toBe(2);

      expect(ping_bob_1.message).toEqual(jasmine.any(CipherMessage));
      expect(ping_bob_2.message).toEqual(jasmine.any(CipherMessage));

      expect(sodium.to_string(await bob.decrypt(bob_store, ping_bob_1))).toBe('Ping1!');

      expect(bob.session_states[bob.session_tag.toString()].state.recv_chains.length).toBe(2);

      expect(sodium.to_string(await bob.decrypt(bob_store, ping_bob_2))).toBe('Ping2!');

      expect(bob.session_states[bob.session_tag.toString()].state.recv_chains.length).toBe(2);

      const pong_alice = Session.encrypt(bob, 'Pong!');
      expect(sodium.to_string(await alice.decrypt(alice_store, pong_alice))).toBe('Pong!');

      expect(alice.session_states[alice.session_tag.toString()].state.recv_chains.length).toBe(3);
      expect(alice.session_states[alice.session_tag.toString()].state.prev_counter).toBe(2);

      const delay_decrypted = await bob.decrypt(bob_store, hello_bob_delayed);
      expect(sodium.to_string(delay_decrypted)).toBe('Hello delay!');

      expect(bob.session_states[bob.session_tag.toString()].state.recv_chains.length).toBe(2);
      expect(bob.session_states[bob.session_tag.toString()].state.prev_counter).toBe(1);

      assert_serialise_deserialise(alice_ident, alice);
      assert_serialise_deserialise(bob_ident, bob);
    });

    it('limits the number of receive chains', async () => {
      const alice_ident = new IdentityKeyPair();
      const alice_store = new SimplePreKeyStore('alice_store', PreKey.generate_prekeys(0, 10));

      const bob_ident = new IdentityKeyPair();
      const bob_store = new SimplePreKeyStore('bob_store', PreKey.generate_prekeys(0, 10));

      const bob_prekey = await bob_store.load_prekey(0);
      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      const alice = Session.init_from_prekey(alice_ident, bob_bundle);
      const hello_bob = Session.encrypt(alice, 'Hello Bob!');

      const bob = await assert_init_from_message(bob_ident, bob_store, hello_bob, 'Hello Bob!');

      expect(alice.session_states[alice.session_tag.toString()].state.recv_chains.length).toBe(1);
      expect(bob.session_states[bob.session_tag.toString()].state.recv_chains.length).toBe(1);

      await Promise.all(
        Array.from({length: Session.MAX_RECV_CHAINS * 2}, async () => {
          const bob_to_alice = Session.encrypt(bob, 'ping');
          expect(sodium.to_string(await alice.decrypt(alice_store, bob_to_alice))).toBe('ping');

          const alice_to_bob = Session.encrypt(alice, 'pong');
          expect(sodium.to_string(await bob.decrypt(bob_store, alice_to_bob))).toBe('pong');

          expect(alice.session_states[alice.session_tag.toString()].state.recv_chains.length).not.toBeGreaterThan(
            Session.MAX_RECV_CHAINS,
          );

          expect(bob.session_states[bob.session_tag.toString()].state.recv_chains.length).not.toBeGreaterThan(
            Session.MAX_RECV_CHAINS,
          );
        }),
      );
    });

    it('handles a counter mismatch', async () => {
      const alice_ident = new IdentityKeyPair();
      const alice_store = new SimplePreKeyStore('alice_store', PreKey.generate_prekeys(0, 10));

      const bob_ident = new IdentityKeyPair();
      const bob_store = new SimplePreKeyStore('bob_store', PreKey.generate_prekeys(0, 10));

      const bob_prekey = await bob_store.load_prekey(0);
      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      const alice = Session.init_from_prekey(alice_ident, bob_bundle);
      const message = Session.encrypt(alice, 'Hello Bob!');

      const bob = await assert_init_from_message(bob_ident, bob_store, message, 'Hello Bob!');
      const ciphertexts = await Promise.all(
        ['Hello1', 'Hello2', 'Hello3', 'Hello4', 'Hello5'].map(text => Session.encrypt(bob, text)),
      );

      expect(sodium.to_string(await alice.decrypt(alice_store, ciphertexts[1]))).toBe('Hello2');
      expect(alice.session_states[alice.session_tag.toString()].state.recv_chains[0].message_keys.length).toBe(1);

      assert_serialise_deserialise(alice_ident, alice);

      expect(sodium.to_string(await alice.decrypt(alice_store, ciphertexts[0]))).toBe('Hello1');
      expect(alice.session_states[alice.session_tag.toString()].state.recv_chains[0].message_keys.length).toBe(0);

      expect(sodium.to_string(await alice.decrypt(alice_store, ciphertexts[2]))).toBe('Hello3');
      expect(alice.session_states[alice.session_tag.toString()].state.recv_chains[0].message_keys.length).toBe(0);

      expect(sodium.to_string(await alice.decrypt(alice_store, ciphertexts[4]))).toBe('Hello5');
      expect(alice.session_states[alice.session_tag.toString()].state.recv_chains[0].message_keys.length).toBe(1);

      expect(sodium.to_string(await alice.decrypt(alice_store, ciphertexts[3]))).toBe('Hello4');
      expect(alice.session_states[alice.session_tag.toString()].state.recv_chains[0].message_keys.length).toBe(0);

      await Promise.all(
        ciphertexts.map(async text => {
          try {
            await alice.decrypt(alice_store, text);
            fail();
          } catch (error) {
            expect(error instanceof DecryptError.DuplicateMessage).toBe(true);
            expect(error.code).toBe(DecryptError.CODE.CASE_209);
          }
        }),
      );

      assert_serialise_deserialise(alice_ident, alice);
      assert_serialise_deserialise(bob_ident, bob);
    });

    it('handles multiple prekey messages', async () => {
      const alice_ident = new IdentityKeyPair();
      const alice_store = new SimplePreKeyStore('alice_store', PreKey.generate_prekeys(0, 10));

      const bob_ident = new IdentityKeyPair();
      const bob_store = new SimplePreKeyStore('bob_store', PreKey.generate_prekeys(0, 10));

      const bob_prekey = await bob_store.load_prekey(0);
      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      const alice = Session.init_from_prekey(alice_ident, bob_bundle);
      const hello_bob1 = Session.encrypt(alice, 'Hello Bob1!');
      const hello_bob2 = Session.encrypt(alice, 'Hello Bob2!');
      const hello_bob3 = Session.encrypt(alice, 'Hello Bob3!');

      const [bob, decrypted] = await Session.init_from_message(bob_ident, bob_store, hello_bob1);

      expect(decrypted).toBeDefined();
      expect(sodium.to_string(decrypted)).toBe('Hello Bob1!');

      expect(Object.keys(bob.session_states).length).toBe(1);
      expect(sodium.to_string(await bob.decrypt(alice_store, hello_bob2))).toBe('Hello Bob2!');
      expect(Object.keys(bob.session_states).length).toBe(1);
      expect(sodium.to_string(await bob.decrypt(alice_store, hello_bob3))).toBe('Hello Bob3!');
      expect(Object.keys(bob.session_states).length).toBe(1);

      assert_serialise_deserialise(alice_ident, alice);
      assert_serialise_deserialise(bob_ident, bob);
    });

    it('handles simultaneous prekey messages', async () => {
      const alice_ident = new IdentityKeyPair();
      const alice_store = new SimplePreKeyStore('alice_store', PreKey.generate_prekeys(0, 10));

      const bob_ident = new IdentityKeyPair();
      const bob_store = new SimplePreKeyStore('bob_store', PreKey.generate_prekeys(0, 10));

      const bob_prekey = await bob_store.load_prekey(0);
      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      const alice_prekey = await alice_store.load_prekey(0);
      const alice_bundle = new PreKeyBundle(alice_ident.public_key, alice_prekey!);

      const alice = Session.init_from_prekey(alice_ident, bob_bundle);
      const hello_bob_encrypted = Session.encrypt(alice, 'Hello Bob!');

      const bob = Session.init_from_prekey(bob_ident, alice_bundle);
      const hello_alice = Session.encrypt(bob, 'Hello Alice!');

      expect(alice.session_tag.toString()).not.toEqual(bob.session_tag.toString());
      expect(hello_alice).toBeDefined();

      const hello_bob_decrypted = await bob.decrypt(bob_store, hello_bob_encrypted);
      expect(sodium.to_string(hello_bob_decrypted)).toBe('Hello Bob!');
      expect(Object.keys(bob.session_states).length).toBe(2);

      expect(sodium.to_string(await alice.decrypt(alice_store, hello_alice))).toBe('Hello Alice!');
      expect(Object.keys(alice.session_states).length).toBe(2);

      const message_alice = Session.encrypt(alice, 'That was fast!');
      expect(sodium.to_string(await bob.decrypt(bob_store, message_alice))).toBe('That was fast!');

      const message_bob = Session.encrypt(bob, ':-)');

      expect(sodium.to_string(await alice.decrypt(alice_store, message_bob))).toBe(':-)');
      expect(alice.session_tag.toString()).toEqual(bob.session_tag.toString());

      assert_serialise_deserialise(alice_ident, alice);
      assert_serialise_deserialise(bob_ident, bob);
    });

    it('handles simultaneous repeated messages', async () => {
      const alice_ident = new IdentityKeyPair();
      const alice_store = new SimplePreKeyStore('alice_store', PreKey.generate_prekeys(0, 10));

      const bob_ident = new IdentityKeyPair();
      const bob_store = new SimplePreKeyStore('bob_store', PreKey.generate_prekeys(0, 10));

      const bob_prekey = await bob_store.load_prekey(0);
      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      const alice_prekey = await alice_store.load_prekey(0);
      const alice_bundle = new PreKeyBundle(alice_ident.public_key, alice_prekey!);

      const alice = Session.init_from_prekey(alice_ident, bob_bundle);
      const hello_bob_plaintext = 'Hello Bob!';
      const hello_bob_encrypted = Session.encrypt(alice, hello_bob_plaintext);

      const bob = Session.init_from_prekey(bob_ident, alice_bundle);
      const hello_alice_plaintext = 'Hello Alice!';
      const hello_alice_encrypted = Session.encrypt(bob, hello_alice_plaintext);

      expect(alice.session_tag.toString()).not.toEqual(bob.session_tag.toString());

      const hello_bob_decrypted = await bob.decrypt(bob_store, hello_bob_encrypted);
      expect(sodium.to_string(hello_bob_decrypted)).toBe(hello_bob_plaintext);

      const hello_alice_decrypted = await alice.decrypt(alice_store, hello_alice_encrypted);
      expect(sodium.to_string(hello_alice_decrypted)).toBe(hello_alice_plaintext);

      const echo_bob1_plaintext = 'Echo Bob1!';
      const echo_bob1_encrypted = Session.encrypt(alice, echo_bob1_plaintext);

      const echo_alice1_plaintext = 'Echo Alice1!';
      const echo_alice1_encrypted = Session.encrypt(bob, echo_alice1_plaintext);

      const echo_bob1_decrypted = await bob.decrypt(bob_store, echo_bob1_encrypted);
      expect(sodium.to_string(echo_bob1_decrypted)).toBe(echo_bob1_plaintext);
      expect(Object.keys(bob.session_states).length).toBe(2);

      const echo_alice1_decrypted = await alice.decrypt(alice_store, echo_alice1_encrypted);
      expect(sodium.to_string(echo_alice1_decrypted)).toBe(echo_alice1_plaintext);
      expect(Object.keys(alice.session_states).length).toBe(2);

      const echo_bob2_plaintext = 'Echo Bob2!';
      const echo_bob2_encrypted = Session.encrypt(alice, echo_bob2_plaintext);

      const echo_alice2_plaintext = 'Echo Alice2!';
      const echo_alice2_encrypted = Session.encrypt(bob, echo_alice2_plaintext);

      const echo_bob2_decrypted = await bob.decrypt(bob_store, echo_bob2_encrypted);
      expect(sodium.to_string(echo_bob2_decrypted)).toBe(echo_bob2_plaintext);
      expect(Object.keys(bob.session_states).length).toBe(2);

      const echo_alice2_decrypted = await alice.decrypt(alice_store, echo_alice2_encrypted);
      expect(sodium.to_string(echo_alice2_decrypted)).toBe(echo_alice2_plaintext);
      expect(Object.keys(alice.session_states).length).toBe(2);

      expect(alice.session_tag.toString()).not.toEqual(bob.session_tag.toString());

      const stop_it_plaintext = 'Stop it!';
      const stop_it_encrypted = Session.encrypt(alice, stop_it_plaintext);

      const stop_it_decrypted = await bob.decrypt(bob_store, stop_it_encrypted);
      expect(sodium.to_string(stop_it_decrypted)).toBe(stop_it_plaintext);
      expect(Object.keys(bob.session_states).length).toBe(2);

      const ok_plaintext = 'OK';
      const ok_encrypted = Session.encrypt(bob, ok_plaintext);

      const ok_decrypted = await alice.decrypt(alice_store, ok_encrypted);
      expect(sodium.to_string(ok_decrypted)).toBe(ok_plaintext);
      expect(Object.keys(alice.session_states).length).toBe(2);

      expect(alice.session_tag.toString()).toEqual(bob.session_tag.toString());

      assert_serialise_deserialise(alice_ident, alice);
      assert_serialise_deserialise(bob_ident, bob);
    });

    it('cannot retry init from message with the same message', async () => {
      const alice_ident = new IdentityKeyPair();

      const bob_ident = new IdentityKeyPair();
      const bob_store = new SimplePreKeyStore('bob_store', PreKey.generate_prekeys(0, 10));

      const bob_prekey = await bob_store.load_prekey(0);
      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      const alice = Session.init_from_prekey(alice_ident, bob_bundle);

      const hello_bob_plaintext = 'Hello Bob!';
      const hello_bob_encrypted = Session.encrypt(alice, hello_bob_plaintext);

      await assert_init_from_message(bob_ident, bob_store, hello_bob_encrypted, hello_bob_plaintext);

      try {
        await Session.init_from_message(bob_ident, bob_store, hello_bob_encrypted);
        fail();
      } catch (error) {
        expect(error instanceof ProteusError).toBe(true);
        expect(error.code).toBe(ProteusError.CODE.CASE_101);
      }
    });

    it('skips message keys', async () => {
      const alice_ident = new IdentityKeyPair();
      const alice_store = new SimplePreKeyStore('alice_store', PreKey.generate_prekeys(0, 10));

      const bob_ident = new IdentityKeyPair();
      const bob_store = new SimplePreKeyStore('bob_store', PreKey.generate_prekeys(0, 10));

      const bob_prekey = await bob_store.load_prekey(0);
      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      const alice = Session.init_from_prekey(alice_ident, bob_bundle);

      const hello_bob_plaintext = 'Hello Bob!';
      const hello_bob_encrypted = Session.encrypt(alice, hello_bob_plaintext);

      let state = alice.session_states[alice.session_tag.toString()].state;
      expect(state.recv_chains.length).toBe(1);
      expect(state.recv_chains[0].chain_key.idx).toBe(0);
      expect(state.send_chain.chain_key.idx).toBe(1);
      expect(state.recv_chains[0].message_keys.length).toBe(0);

      const bob = await assert_init_from_message(bob_ident, bob_store, hello_bob_encrypted, hello_bob_plaintext);

      state = bob.session_states[bob.session_tag.toString()].state;
      expect(state.recv_chains.length).toBe(1);
      expect(state.recv_chains[0].chain_key.idx).toBe(1);
      expect(state.send_chain.chain_key.idx).toBe(0);
      expect(state.recv_chains[0].message_keys.length).toBe(0);

      const hello_alice0_plaintext = 'Hello0';
      const hello_alice0_encrypted = Session.encrypt(bob, hello_alice0_plaintext);

      Session.encrypt(bob, 'Hello1'); // unused result

      const hello_alice2_plaintext = 'Hello2';
      const hello_alice2_encrypted = Session.encrypt(bob, hello_alice2_plaintext);

      const hello_alice2_decrypted = await alice.decrypt(alice_store, hello_alice2_encrypted);
      expect(sodium.to_string(hello_alice2_decrypted)).toBe(hello_alice2_plaintext);

      // Alice has two skipped message keys in her new receive chain:
      state = alice.session_states[alice.session_tag.toString()].state;
      expect(state.recv_chains.length).toBe(2);
      expect(state.recv_chains[0].chain_key.idx).toBe(3);
      expect(state.send_chain.chain_key.idx).toBe(0);
      expect(state.recv_chains[0].message_keys.length).toBe(2);
      expect(state.recv_chains[0].message_keys[0].counter).toBe(0);
      expect(state.recv_chains[0].message_keys[1].counter).toBe(1);

      const hello_bob0_plaintext = 'Hello0';
      const hello_bob0_encrypted = Session.encrypt(alice, hello_bob0_plaintext);

      const hello_bob0_decrypted = await bob.decrypt(bob_store, hello_bob0_encrypted);
      expect(sodium.to_string(hello_bob0_decrypted)).toBe(hello_bob0_plaintext);

      // For Bob everything is normal still. A new message from Alice means a
      // new receive chain has been created and again no skipped message keys.

      state = bob.session_states[bob.session_tag.toString()].state;
      expect(state.recv_chains.length).toBe(2);
      expect(state.recv_chains[0].chain_key.idx).toBe(1);
      expect(state.send_chain.chain_key.idx).toBe(0);
      expect(state.recv_chains[0].message_keys.length).toBe(0);

      const hello_alice0_decrypted = await alice.decrypt(alice_store, hello_alice0_encrypted);
      expect(sodium.to_string(hello_alice0_decrypted)).toBe(hello_alice0_plaintext);

      // Alice received the first of the two missing messages. Therefore
      // only one message key is still skipped (counter value = 1).

      state = alice.session_states[alice.session_tag.toString()].state;
      expect(state.recv_chains.length).toBe(2);
      expect(state.recv_chains[0].message_keys.length).toBe(1);
      expect(state.recv_chains[0].message_keys[0].counter).toBe(1);

      const hello_again0_plaintext = 'Again0';
      const hello_again0_encrypted = Session.encrypt(bob, hello_again0_plaintext);

      const hello_again1_plaintext = 'Again1';
      const hello_again1_encrypted = Session.encrypt(bob, hello_again1_plaintext);

      const hello_again1_decrypted = await alice.decrypt(alice_store, hello_again1_encrypted);
      expect(sodium.to_string(hello_again1_decrypted)).toBe(hello_again1_plaintext);

      // Alice received the first of the two missing messages. Therefore
      // only one message key is still skipped (counter value = 1).

      state = alice.session_states[alice.session_tag.toString()].state;
      expect(state.recv_chains.length).toBe(3);
      expect(state.recv_chains[0].message_keys.length).toBe(1);
      expect(state.recv_chains[1].message_keys.length).toBe(1);
      expect(state.recv_chains[0].message_keys[0].counter).toBe(0);
      expect(state.recv_chains[1].message_keys[0].counter).toBe(1);

      const hello_again0_decrypted = await alice.decrypt(alice_store, hello_again0_encrypted);
      expect(sodium.to_string(hello_again0_decrypted)).toBe(hello_again0_plaintext);
    });

    it('replaces prekeys', async () => {
      const alice_ident = new IdentityKeyPair();

      const bob_ident = new IdentityKeyPair();
      const bob_store1 = new SimplePreKeyStore('bob_store1', PreKey.generate_prekeys(0, 10));
      const bob_store2 = new SimplePreKeyStore('bob_store2', PreKey.generate_prekeys(0, 10));

      const bob_prekey = await bob_store1.load_prekey(0);
      expect(bob_prekey!.key_id).toBe(0);
      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      const alice = Session.init_from_prekey(alice_ident, bob_bundle);

      const hello_bob1_plaintext = 'Hello Bob!';
      const hello_bob1_encrypted = Session.encrypt(alice, hello_bob1_plaintext);

      const bob = await assert_init_from_message(bob_ident, bob_store1, hello_bob1_encrypted, hello_bob1_plaintext);

      expect(Object.keys(bob.session_states).length).toBe(1);

      const hello_bob2_plaintext = 'Hello Bob2!';
      const hello_bob2_encrypted = Session.encrypt(alice, hello_bob2_plaintext);

      const hello_bob2_decrypted = await bob.decrypt(bob_store1, hello_bob2_encrypted);
      expect(sodium.to_string(hello_bob2_decrypted)).toBe(hello_bob2_plaintext);

      expect(Object.keys(bob.session_states).length).toBe(1);

      const hello_bob3_plaintext = 'Hello Bob3!';
      const hello_bob3_encrypted = Session.encrypt(alice, hello_bob3_plaintext);

      const hello_bob3_decrypted = await bob.decrypt(bob_store2, hello_bob3_encrypted);
      expect(sodium.to_string(hello_bob3_decrypted)).toBe(hello_bob3_plaintext);

      expect(Object.keys(bob.session_states).length).toBe(1);
    });
  });

  describe('Process', () => {
    it('works until the max counter gap', async () => {
      const alice_ident = new IdentityKeyPair();

      const bob_ident = new IdentityKeyPair();

      const pre_keys = [PreKey.last_resort()];
      const bob_store = new SimplePreKeyStore('bob_store', pre_keys);

      const bob_prekey = await bob_store.load_prekey(PreKey.MAX_PREKEY_ID);
      expect(bob_prekey!.key_id).toBe(PreKey.MAX_PREKEY_ID);

      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      const alice = Session.init_from_prekey(alice_ident, bob_bundle);

      const hello_bob1_plaintext = 'Hello Bob1!';
      const hello_bob1_encrypted = Session.encrypt(alice, hello_bob1_plaintext);

      const bob = await assert_init_from_message(bob_ident, bob_store, hello_bob1_encrypted, hello_bob1_plaintext);
      expect(Object.keys(bob.session_states).length).toBe(1);

      await Promise.all(
        Array.from({length: 1001}, async () => {
          const hello_bob2_plaintext = 'Hello Bob2!';
          const hello_bob2_encrypted = Session.encrypt(alice, hello_bob2_plaintext);
          const hello_bob2_decrypted = await bob.decrypt(bob_store, hello_bob2_encrypted);
          expect(sodium.to_string(hello_bob2_decrypted)).toBe(hello_bob2_plaintext);
          expect(Object.keys(bob.session_states).length).toBe(1);
        }),
      );
    });

    it('allows Alice to send a message to Bob on which Bob replies', async () => {
      // Alice's identity setup
      const alice_ident = new IdentityKeyPair();
      const alice_store = new SimplePreKeyStore('alice_store', PreKey.generate_prekeys(0, 10));

      // Bob's identity setup
      const bob_ident = new IdentityKeyPair();
      const bob_store = new SimplePreKeyStore('bob_store', PreKey.generate_prekeys(0, 10));

      // Alice creates a session with Bob's pre-key bundle
      const bob_prekey = await bob_store.load_prekey(0);
      const bob_bundle = new PreKeyBundle(bob_ident.public_key, bob_prekey!);

      // Alice encrypts a message for Bob
      const alice = Session.init_from_prekey(alice_ident, bob_bundle);
      const hello_bob = Session.encrypt(alice, 'Hello Bob!');

      // Bob decrypts the message from Alice
      const bob = await assert_init_from_message(bob_ident, bob_store, hello_bob, 'Hello Bob!');

      // Bob encrypts a message for Alice
      const messageForAlicePlain = 'Hello Alice!';
      const messageForAlice = Session.encrypt(bob, messageForAlicePlain);

      // Alice decrypts the message from Bob
      const decrypted_message = await alice.decrypt(alice_store, messageForAlice);

      expect(sodium.to_string(decrypted_message)).toBe(messageForAlicePlain);
    }, 10000);

    it('pathological case', async () => {
      const numberOfParticipants = 32;
      const alice_ident = new IdentityKeyPair();

      const bob_ident = new IdentityKeyPair();

      const preKeys = PreKey.generate_prekeys(0, numberOfParticipants);
      const bob_store = new SimplePreKeyStore('bobStore', preKeys);
      const bob_prekeys = Array.from(bob_store.prekeys, ([_keyId, prekey]) => PreKey.deserialise(prekey));

      const participants = await Promise.all(
        bob_prekeys.map(pk => {
          const bundle = new PreKeyBundle(bob_ident.public_key, pk);
          return Session.init_from_prekey(alice_ident, bundle);
        }),
      );

      expect(participants.length).toBe(numberOfParticipants);

      const message = await Session.encrypt(participants[0], 'Hello Bob!');
      const bob = await assert_init_from_message(bob_ident, bob_store, message, 'Hello Bob!');

      await Promise.all(
        participants.map(async participant => {
          await Promise.all(Array.from({length: 900}, () => Session.encrypt(participant, 'hello')));
          const encrypted_message = Session.encrypt(participant, 'Hello Bob!');
          expect(sodium.to_string(await bob.decrypt(bob_store, encrypted_message))).toBe('Hello Bob!');
        }),
      );

      expect(Object.keys(bob.session_states).length).toBe(numberOfParticipants);

      await Promise.all(
        participants.map(async participant => {
          const encrypted_message = Session.encrypt(participant, 'Hello Bob!');
          expect(sodium.to_string(await bob.decrypt(bob_store, encrypted_message))).toBe('Hello Bob!');
        }),
      );
    }, 10000);
  });
});
