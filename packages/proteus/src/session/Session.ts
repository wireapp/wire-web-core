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

import {Decoder, Encoder} from '@wireapp/cbor';
import {SessionState} from './SessionState';
import type {PreKeyStore} from './PreKeyStore';
import { SessionTag } from '../message/SessionTag';
import { IdentityKeyPair } from '../keys/IdentityKeyPair';
import { IdentityKey } from '../keys/IdentityKey';
import { PublicKey } from '../keys/PublicKey';
import { CipherMessage } from '../message/CipherMessage';
import { DecryptError } from '../errors/DecryptError';
import { Envelope } from '../message/Envelope';
import { PreKey } from '../keys/PreKey';
import { PreKeyMessage } from '../message/PreKeyMessage';
import {zeroize} from "../util/MemoryUtil";
import { ProteusError } from '../errors/ProteusError';
import { PreKeyBundle } from '../keys/PreKeyBundle';
import { KeyPair } from '../keys/KeyPair';
import { DecodeError } from '../errors/DecodeError';

export interface IntermediateSessionState {
  [index: string]: {
    idx: number;
    state: SessionState;
    tag: SessionTag;
  };
}

export class Session {
  static MAX_SESSION_STATES = 100;

  readonly local_identity: IdentityKeyPair;
  readonly remote_identity: IdentityKey;
  readonly version: number;
  private counter: number;
  pending_prekey: [number, PublicKey] | null;
  session_states: IntermediateSessionState;
  session_tag: SessionTag;
  session_tag_name: string;

  constructor(
    localIdentity: IdentityKeyPair,
    remoteIdentity: IdentityKey,
    sessionTag: SessionTag = new SessionTag(),
    pendingPrekey: [number, PublicKey] | null = null,
    sessionStates: IntermediateSessionState = {},
    version: number = 1,
  ) {
    this.local_identity = localIdentity;
    this.pending_prekey = pendingPrekey;
    this.remote_identity = remoteIdentity;
    this.session_states = sessionStates;
    this.session_tag = sessionTag;
    this.session_tag_name = sessionTag.toString();
    this.version = version;
    this.counter = 0;
  }

  /**
   * @param local_identity Alice's Identity Key Pair
   * @param remote_pkbundle Bob's Pre-Key Bundle
   */
  static init_from_prekey(local_identity: IdentityKeyPair, remote_pkbundle: PreKeyBundle): Session {
    const alice_base = new KeyPair();

    const state = SessionState.init_as_alice(local_identity, alice_base, remote_pkbundle);

    const session_tag = new SessionTag();

    const pendingPrekey: [number, PublicKey] = [remote_pkbundle.prekey_id, alice_base.public_key];
    const session = new Session(local_identity, remote_pkbundle.identity_key, session_tag, pendingPrekey);

    session._insert_session_state(session_tag, state);
    return session;
  }

  static async init_from_message(
    ourIdentity: IdentityKeyPair,
    prekey_store: PreKeyStore,
    envelope: Envelope,
  ): Promise<[Session, Uint8Array]> {
    const preKeyMessage = envelope.message;

    if (preKeyMessage instanceof CipherMessage) {
      throw new DecryptError.InvalidMessage(
        "Can't initialise a session from a CipherMessage.",
        DecryptError.CODE.CASE_201,
      );
    }

    if (preKeyMessage instanceof PreKeyMessage) {
      const session = new Session(ourIdentity, preKeyMessage.identity_key, preKeyMessage.message.session_tag);

      const state = await session._new_state(prekey_store, preKeyMessage);
      const plain = state.decrypt(envelope, preKeyMessage.message);
      session._insert_session_state(preKeyMessage.message.session_tag, state);

      if (preKeyMessage.prekey_id < PreKey.MAX_PREKEY_ID) {
        const prekey = await prekey_store.load_prekey(preKeyMessage.prekey_id);
        zeroize(prekey);

        try {
          await prekey_store.delete_prekey(preKeyMessage.prekey_id);
        } catch (error) {
          throw new DecryptError.PrekeyNotFound(
            `Could not delete PreKey: ${error.message}`,
            DecryptError.CODE.CASE_203,
          );
        }
      }

      return [session, plain];
    }

    throw new DecryptError.InvalidMessage(
      'Unknown message format: The message is neither a "CipherMessage" nor a "PreKeyMessage".',
      DecryptError.CODE.CASE_202,
    );
  }

  private async _new_state(preKeyStore: PreKeyStore, preKeyMessage: PreKeyMessage): Promise<SessionState> {
    try {
      const pre_key = await preKeyStore.load_prekey(preKeyMessage.prekey_id);
      return SessionState.init_as_bob(
        this.local_identity,
        pre_key!.key_pair,
        preKeyMessage.identity_key,
        preKeyMessage.base_key,
      );
    } catch (error) {
      throw new ProteusError(
        `Unable to find PreKey with ID "${preKeyMessage.prekey_id}" in PreKey store "${preKeyStore.constructor.name}".`,
        ProteusError.CODE.CASE_101,
      );
    }
  }

  private _insert_session_state(sessionTag: SessionTag, state: SessionState): void {
    const sessionTagName = sessionTag.toString();

    if (this.session_states.hasOwnProperty(sessionTagName)) {
      this.session_states[sessionTagName].state = state;
    } else {
      if (this.counter >= Number.MAX_SAFE_INTEGER) {
        this.session_states = {};
        this.counter = 0;
      }

      this.session_states[sessionTagName] = {
        idx: this.counter,
        state,
        tag: sessionTag,
      };
      this.counter++;
    }

    if (this.session_tag_name !== sessionTagName) {
      this.session_tag = sessionTag;
      this.session_tag_name = sessionTagName;
    }

    if (Object.keys(this.session_states).length < Session.MAX_SESSION_STATES) {
      return;
    }

    // if we get here, it means that we have more than MAX_SESSION_STATES and
    // we need to evict the oldest one.
    return this._evict_oldest_session_state();
  }

  private _evict_oldest_session_state(): void {
    const oldest = Object.keys(this.session_states)
      .filter(sessionTagName => sessionTagName.toString() !== this.session_tag_name)
      .reduce((lowest, obj) => {
        return this.session_states[obj].idx < this.session_states[lowest].idx ? obj.toString() : lowest;
      });

    zeroize(this.session_states[oldest]);
    delete this.session_states[oldest];
  }

  get_local_identity(): IdentityKey {
    return this.local_identity.public_key;
  }

  /**
   * @param plaintext The plaintext which needs to be encrypted
   */
  static encrypt(session: Session, plaintext: string | Uint8Array): Envelope {
    const session_state = session.session_states[session.session_tag_name];

    if (!session_state) {
      throw new ProteusError(
        `Could not find session for tag '${(session.session_tag || '').toString()}'.`,
        ProteusError.CODE.CASE_102,
      );
    }

    return SessionState.encrypt(
      session_state.state,
      session.local_identity.public_key,
      session.pending_prekey,
      session.session_tag,
      plaintext,
    );
  }

  async decrypt(prekey_store: PreKeyStore, envelope: Envelope): Promise<Uint8Array> {
    const {message} = envelope;

    if (message instanceof CipherMessage) {
      return this._decrypt_cipher_message(envelope, message);
    }

    if (message instanceof PreKeyMessage) {
      const actual_fingerprint = message.identity_key.fingerprint();
      const expected_fingerprint = this.remote_identity.fingerprint();

      if (actual_fingerprint !== expected_fingerprint) {
        const message = `Fingerprints do not match: We expected '${expected_fingerprint}', but received '${actual_fingerprint}'.`;
        throw new DecryptError.RemoteIdentityChanged(message, DecryptError.CODE.CASE_204);
      }

      return this._decrypt_prekey_message(envelope, message, prekey_store);
    }

    throw new DecryptError('Unknown message type.', DecryptError.CODE.CASE_200);
  }

  private async _decrypt_prekey_message(
    envelope: Envelope,
    msg: PreKeyMessage,
    prekey_store: PreKeyStore,
  ): Promise<Uint8Array> {
    try {
      const plaintext = this._decrypt_cipher_message(envelope, msg.message);
      return plaintext;
    } catch (error) {
      if (error instanceof DecryptError.InvalidSignature || error instanceof DecryptError.InvalidMessage) {
        const state = await this._new_state(prekey_store, msg);
        const plaintext = state.decrypt(envelope, msg.message);

        if (msg.prekey_id !== PreKey.MAX_PREKEY_ID) {
          const prekey = await prekey_store.load_prekey(msg.prekey_id);
          zeroize(prekey);
          await prekey_store.delete_prekey(msg.prekey_id);
        }

        this._insert_session_state(msg.message.session_tag, state);
        this.pending_prekey = null;

        return plaintext;
      }
      throw error;
    }
  }

  private _decrypt_cipher_message(envelope: Envelope, msg: CipherMessage): Uint8Array {
    const state = this.session_states[msg.session_tag.toString()];
    if (!state) {
      throw new DecryptError.InvalidMessage(
        `Local session not found for message session tag '${msg.session_tag}'.`,
        DecryptError.CODE.CASE_205,
      );
    }

    // serialise and de-serialise for a deep clone
    // THIS IS IMPORTANT, DO NOT MUTATE THE SESSION STATE IN-PLACE
    // mutating in-place can lead to undefined behavior and undefined state in edge cases
    const sessionState = SessionState.deserialise(state.state.serialise());

    const plaintext = sessionState.decrypt(envelope, msg);

    this.pending_prekey = null;

    this._insert_session_state(msg.session_tag, sessionState);
    return plaintext;
  }

  serialise(): ArrayBuffer {
    const encoder = new Encoder();
    Session.encode(encoder, this);
    return encoder.get_buffer();
  }

  static deserialise(local_identity: IdentityKeyPair, buf: ArrayBuffer): Session {
    const decoder = new Decoder(buf);
    return Session.decode(local_identity, decoder);
  }

  static encode(encoder: Encoder, session: Session): void {
    encoder.object(6);
    encoder.u8(0);
    encoder.u8(session.version);
    encoder.u8(1);
    SessionTag.encode(encoder, session.session_tag);
    encoder.u8(2);
    IdentityKey.encode(encoder, session.local_identity.public_key);
    encoder.u8(3);
    IdentityKey.encode(encoder, session.remote_identity);

    encoder.u8(4);
    if (session.pending_prekey) {
      encoder.object(2);
      encoder.u8(0);
      encoder.u16(session.pending_prekey[0]);
      encoder.u8(1);
      PublicKey.encode(encoder, session.pending_prekey[1]);
    } else {
      encoder.null();
    }

    encoder.u8(5);
    const sessionStatesIndices = Object.keys(session.session_states);
    encoder.object(sessionStatesIndices.length);

    for (const sessionStatesIndex of sessionStatesIndices) {
      const state = session.session_states[sessionStatesIndex];
      SessionTag.encode(encoder, state.tag);
      SessionState.encode(encoder, state.state);
    }
  }

  static decode(localIdentity: IdentityKeyPair, decoder: Decoder): Session {
    let version;
    let sessionTag;
    let remoteIdentity;
    let pendingPrekey: any;
    let sessionStates: IntermediateSessionState = {};

    const propertiesLength = decoder.object();
    for (let index = 0; index <= propertiesLength - 1; index++) {
      switch (decoder.u8()) {
        case 0: {
          version = decoder.u8();
          break;
        }
        case 1: {
          sessionTag = SessionTag.decode(decoder);
          break;
        }
        case 2: {
          const identity_key = IdentityKey.decode(decoder);
          if (localIdentity.public_key.fingerprint() !== identity_key.fingerprint()) {
            throw new DecodeError.LocalIdentityChanged(undefined, DecodeError.CODE.CASE_300);
          }
          localIdentity = localIdentity;
          break;
        }
        case 3: {
          remoteIdentity = IdentityKey.decode(decoder);
          break;
        }
        case 4: {
          switch (decoder.optional(() => decoder.object())) {
            case null:
              pendingPrekey = null;
              break;
            case 2:
              pendingPrekey = [];
              for (let key = 0; key <= 1; ++key) {
                switch (decoder.u8()) {
                  case 0:
                    pendingPrekey[0] = decoder.u16();
                    break;
                  case 1:
                    pendingPrekey[1] = PublicKey.decode(decoder);
                    break;
                }
              }
              break;
            default:
              throw new DecodeError.InvalidType(undefined, DecodeError.CODE.CASE_301);
          }
          break;
        }
        case 5: {
          sessionStates = {};

          const nprops = decoder.object();

          for (let index = 0; index <= nprops - 1; index++) {
            const tag = SessionTag.decode(decoder);
            sessionStates[tag.toString()] = {
              idx: index,
              state: SessionState.decode(decoder),
              tag,
            };
          }
          break;
        }
        default: {
          decoder.skip();
        }
      }
    }

    if (!remoteIdentity) {
      throw new DecodeError('Missing remote identity');
    }

    return new Session(localIdentity, remoteIdentity, sessionTag, pendingPrekey, sessionStates, version);
  }
}
