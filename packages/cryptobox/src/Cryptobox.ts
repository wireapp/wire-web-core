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

import {LRUCache} from '@wireapp/lru-cache';
import {PriorityQueue} from '@wireapp/priority-queue';
import {
  addEntropy,
  init as initProteus,
  keys as ProteusKeys,
  message as ProteusMessage,
  session as ProteusSession,
} from '@wireapp/proteus';
import type {CRUDEngineBaseCollection} from '@wireapp/store-engine';
import {Decoder, Encoder} from 'bazinga64';
import {EventEmitter} from 'events';
import {CryptoboxSession} from './CryptoboxSession';
import {CryptoboxError, DecryptionError, InvalidPreKeyFormatError} from './error/';
import type {SerializedCryptobox} from './SerializedCryptobox';
import {CryptoboxCRUDStore} from './store/CryptoboxCRUDStore';

const DEFAULT_CAPACITY = 1000;
const {version}: {version: string} = require('../package.json');

enum TOPIC {
  NEW_PREKEYS = 'new-prekeys',
  NEW_SESSION = 'new-session',
}

export interface Cryptobox {
  on(event: TOPIC.NEW_PREKEYS, listener: (prekeys: ProteusKeys.PreKey[]) => void): this;
  on(event: TOPIC.NEW_SESSION, listener: (session: string) => void): this;
}

export class Cryptobox extends EventEmitter {
  private cachedSessions: LRUCache<CryptoboxSession>;
  private queues = new LRUCache<PriorityQueue>(DEFAULT_CAPACITY);
  private readonly minimumAmountOfPreKeys: number;
  private readonly store: CryptoboxCRUDStore;
  private identity: ProteusKeys.IdentityKeyPair | undefined;

  public static VERSION = version;
  public static readonly TOPIC = TOPIC;
  public lastResortPreKey: ProteusKeys.PreKey | undefined;

  constructor(engine: CRUDEngineBaseCollection, minimumAmountOfPreKeys: number = 1) {
    super();

    if (minimumAmountOfPreKeys > ProteusKeys.PreKey.MAX_PREKEY_ID) {
      minimumAmountOfPreKeys = ProteusKeys.PreKey.MAX_PREKEY_ID;
    }

    this.cachedSessions = new LRUCache(DEFAULT_CAPACITY);
    this.minimumAmountOfPreKeys = minimumAmountOfPreKeys;
    this.store = new CryptoboxCRUDStore(engine);
  }

  private get_session_queue(sessionId: string): PriorityQueue {
    let queue = this.queues.get(sessionId);

    if (!queue) {
      queue = new PriorityQueue({maxRetries: 0});
      this.queues.set(sessionId, queue);
    }

    return queue;
  }

  private save_session_in_cache(session: CryptoboxSession): CryptoboxSession {
    this.cachedSessions.set(session.id, session);
    return session;
  }

  private load_session_from_cache(sessionId: string): CryptoboxSession | undefined {
    return this.cachedSessions.get(sessionId);
  }

  private remove_session_from_cache(sessionId: string): void {
    this.cachedSessions.delete(sessionId);
  }

  public async create(entropyData?: Uint8Array): Promise<ProteusKeys.PreKey[]> {
    await initProteus();
    addEntropy(entropyData);

    await this.create_new_identity();
    await this.create_last_resort_prekey();
    return this.init(false);
  }

  public getIdentity(): ProteusKeys.IdentityKeyPair {
    if (!this.identity) {
      throw new CryptoboxError('Failed to load local identity');
    }
    return this.identity;
  }

  public async load(): Promise<ProteusKeys.PreKey[]> {
    await initProteus();
    const identity = await this.store.load_identity();
    if (!identity) {
      throw new CryptoboxError('Failed to load local identity');
    }
    this.identity = identity;

    /* Add entropy from the identity key secret key. We'll use the complete serialized
     * keypair, because that's easiest to get here.
     */
    addEntropy(new Uint8Array(identity.serialise()));

    const preKeysFromStorage = await this.store.load_prekeys();
    const lastResortPreKey = preKeysFromStorage.find(preKey => preKey.key_id === ProteusKeys.PreKey.MAX_PREKEY_ID);
    if (!lastResortPreKey) {
      throw new CryptoboxError('Failed to load last resort PreKey');
    }
    this.lastResortPreKey = lastResortPreKey;

    return this.init(true);
  }

  private async init(publishPrekeys?: boolean): Promise<ProteusKeys.PreKey[]> {
    await this.refill_prekeys(publishPrekeys);
    const prekeys = await this.store.load_prekeys();
    return prekeys.sort((a, b) => a.key_id - b.key_id);
  }

  public async get_serialized_last_resort_prekey(): Promise<{id: number; key: string}> {
    if (this.lastResortPreKey) {
      return this.serialize_prekey(this.lastResortPreKey);
    }
    throw new CryptoboxError('No last resort PreKey available.');
  }

  private get_prekey(prekey_id: number = ProteusKeys.PreKey.MAX_PREKEY_ID): Promise<ProteusKeys.PreKey | undefined> {
    return this.store.load_prekey(prekey_id);
  }

  protected async get_prekey_bundle(
    preKeyId: number = ProteusKeys.PreKey.MAX_PREKEY_ID,
  ): Promise<ProteusKeys.PreKeyBundle> {
    const preKey = await this.get_prekey(preKeyId);

    if (!this.identity) {
      throw new CryptoboxError('No local identity available.');
    }
    if (!preKey) {
      throw new CryptoboxError(`PreKey with ID "${preKeyId}" cannot be found.`);
    }

    return new ProteusKeys.PreKeyBundle(this.identity.public_key, preKey);
  }

  public async get_serialized_standard_prekeys(): Promise<{id: number; key: string}[]> {
    const prekeys = await this.store.load_prekeys();
    return prekeys
      .filter((preKey: ProteusKeys.PreKey) => {
        const isLastResortPreKey = preKey.key_id === ProteusKeys.PreKey.MAX_PREKEY_ID;
        return !isLastResortPreKey;
      })
      .map((preKey: ProteusKeys.PreKey) => this.serialize_prekey(preKey));
  }

  private publish_event(topic: TOPIC, event: ProteusKeys.PreKey[] | string): void {
    this.emit(topic, event);
  }

  private publish_prekeys(newPreKeys: ProteusKeys.PreKey[]): void {
    if (newPreKeys.length > 0) {
      this.publish_event(Cryptobox.TOPIC.NEW_PREKEYS, newPreKeys);
    }
  }

  private publish_session_id(session: CryptoboxSession): void {
    this.publish_event(Cryptobox.TOPIC.NEW_SESSION, session.id);
  }

  /**
   * This method returns all PreKeys available, respecting the minimum required amount of PreKeys.
   * If all available PreKeys don't meet the minimum PreKey amount, new PreKeys will be created.
   */
  private async refill_prekeys(publishPrekeys: boolean = true): Promise<ProteusKeys.PreKey[]> {
    const prekeys = await this.store.load_prekeys();

    const missingAmount = Math.max(0, this.minimumAmountOfPreKeys - prekeys.length);

    if (missingAmount > 0) {
      const startId = prekeys.reduce((currentHighestValue: number, currentPreKey: ProteusKeys.PreKey) => {
        const isLastResortPreKey = currentPreKey.key_id === ProteusKeys.PreKey.MAX_PREKEY_ID;
        return isLastResortPreKey ? currentHighestValue : Math.max(currentPreKey.key_id + 1, currentHighestValue);
      }, 0);

      const newPreKeys = await this.new_prekeys(startId, missingAmount);

      if (publishPrekeys) {
        this.publish_prekeys(newPreKeys);
      }

      prekeys.push(...newPreKeys);
    }

    return prekeys;
  }

  private async create_new_identity(): Promise<ProteusKeys.IdentityKeyPair> {
    await this.store.delete_all();
    const identity = new ProteusKeys.IdentityKeyPair();
    return this.save_identity(identity);
  }

  private save_identity(identity: ProteusKeys.IdentityKeyPair): Promise<ProteusKeys.IdentityKeyPair> {
    this.identity = identity;
    return this.store.save_identity(identity);
  }

  /**
   * Creates (and persists) a new session which can be used for cryptographic operations (encryption & decryption) from
   * a remote PreKey bundle. This function is automatically called on every execution of "encrypt" and "decrypt" so you
   * might not need to call it yourself. However, it has been marked as "public" because there are some cases where you
   * just need the session without executing an encryption or decryption. This is the case when you for example just
   * want to show the fingerprint of the remote party.
   */
  public async session_from_prekey(sessionId: string, preKeyBundle: ArrayBuffer): Promise<CryptoboxSession> {
    try {
      return await this.session_load(sessionId);
    } catch (sessionLoadError) {
      let bundle: ProteusKeys.PreKeyBundle;

      try {
        bundle = ProteusKeys.PreKeyBundle.deserialise(preKeyBundle);
      } catch (error) {
        const message = `PreKey bundle for session "${sessionId}" has an unsupported format: ${
          (error as Error).message
        }`;
        throw new InvalidPreKeyFormatError(message);
      }

      if (this.identity) {
        const session = ProteusSession.Session.init_from_prekey(this.identity, bundle);
        const cryptobox_session = new CryptoboxSession(sessionId, session);
        return this.session_save(cryptobox_session);
      }

      throw new CryptoboxError('No local identity available.');
    }
  }

  /**
   * Uses a cipher message to create a new session and to decrypt to message which the given cipher message contains.
   * Saving the newly created session is not needed as it's done during the inbuilt decryption phase.
   */
  private async session_from_message(
    sessionId: string,
    envelope: ArrayBuffer,
  ): Promise<[CryptoboxSession, Uint8Array]> {
    const env: ProteusMessage.Envelope = ProteusMessage.Envelope.deserialise(envelope);

    if (this.identity) {
      const [session, decrypted] = await ProteusSession.Session.init_from_message(this.identity, this.store, env);
      const cryptoBoxSession = new CryptoboxSession(sessionId, session);
      return [cryptoBoxSession, decrypted];
    }

    throw new CryptoboxError('No local identity available.');
  }

  public async session_load(sessionId: string): Promise<CryptoboxSession> {
    const cachedSession = this.load_session_from_cache(sessionId);

    if (cachedSession) {
      return cachedSession;
    }

    if (this.identity) {
      const session = await this.store.read_session(this.identity, sessionId);
      const cryptoboxSession = new CryptoboxSession(sessionId, session);
      return this.save_session_in_cache(cryptoboxSession);
    }

    throw new CryptoboxError('No local identity available.');
  }

  private async session_save(session: CryptoboxSession): Promise<CryptoboxSession> {
    await this.store.create_session(session.id, session.session);
    return this.save_session_in_cache(session);
  }

  private async session_update(session: CryptoboxSession): Promise<CryptoboxSession> {
    await this.store.update_session(session.id, session.session);
    return this.save_session_in_cache(session);
  }

  public session_delete(sessionId: string): Promise<string> {
    this.remove_session_from_cache(sessionId);
    return this.store.delete_session(sessionId);
  }

  private async create_last_resort_prekey(): Promise<ProteusKeys.PreKey> {
    this.lastResortPreKey = ProteusKeys.PreKey.last_resort();
    const preKeys = await this.store.save_prekeys([this.lastResortPreKey]);
    return preKeys[0];
  }

  public serialize_prekey(prekey: ProteusKeys.PreKey): {id: number; key: string} {
    if (this.identity) {
      return new ProteusKeys.PreKeyBundle(this.identity.public_key, prekey).serialised_json();
    }

    throw new CryptoboxError('No local identity available.');
  }

  /**
   * Creates new PreKeys and saves them into the storage.
   */
  private async new_prekeys(start: number, size: number = 0): Promise<ProteusKeys.PreKey[]> {
    if (size === 0) {
      return [];
    }

    const newPreKeys = ProteusKeys.PreKey.generate_prekeys(start, size);
    return this.store.save_prekeys(newPreKeys);
  }

  public async encrypt(
    sessionId: string,
    payload: string | Uint8Array,
    preKeyBundle?: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    return this.get_session_queue(sessionId).add(async () => {
      const session = preKeyBundle
        ? await this.session_from_prekey(sessionId, preKeyBundle)
        : await this.session_load(sessionId);
      const encryptedBuffer = session.encrypt(payload);
      await this.session_update(session);
      return encryptedBuffer;
    });
  }

  public async decrypt(sessionId: string, ciphertext: ArrayBuffer): Promise<Uint8Array> {
    if (ciphertext.byteLength === 0) {
      throw new DecryptionError('Cannot decrypt an empty ArrayBuffer');
    }

    return this.get_session_queue(sessionId).add(async () => {
      let session: CryptoboxSession;
      let decryptedMessage: Uint8Array;
      let isNewSession = false;

      try {
        session = await this.session_load(sessionId);
      } catch (error) {
        isNewSession = true;
        [session, decryptedMessage] = await this.session_from_message(sessionId, ciphertext);
        this.publish_session_id(session);
        await this.session_save(session);
      }

      if (!isNewSession) {
        decryptedMessage = await session.decrypt(ciphertext, this.store);
        await this.session_update(session);
      }

      await this.refill_prekeys(true);
      return decryptedMessage!;
    });
  }

  private deleteData(): Promise<true> {
    this.cachedSessions = new LRUCache(DEFAULT_CAPACITY);
    this.identity = undefined;
    this.lastResortPreKey = undefined;
    this.queues = new LRUCache<PriorityQueue>(DEFAULT_CAPACITY);
    return this.store.delete_all();
  }

  private importIdentity(payload: string): Promise<ProteusKeys.IdentityKeyPair> {
    const identityBuffer = Decoder.fromBase64(payload).asBytes.buffer;
    const identity = ProteusKeys.IdentityKeyPair.deserialise(identityBuffer);
    return this.save_identity(identity);
  }

  private importPreKeys(serializedPreKeys: {[sessionId: string]: string}): Promise<ProteusKeys.PreKey[]> {
    const proteusPreKeys = Object.values(serializedPreKeys).map(preKey => {
      const preKeyBuffer = Decoder.fromBase64(preKey).asBytes.buffer;
      const proteusPreKey = ProteusKeys.PreKey.deserialise(preKeyBuffer);
      if (proteusPreKey.key_id === ProteusKeys.PreKey.MAX_PREKEY_ID) {
        this.lastResortPreKey = proteusPreKey;
      }
      return proteusPreKey;
    });

    return this.store.save_prekeys(proteusPreKeys);
  }

  private async importSessions(serializedSessions: {[sessionId: string]: string}): Promise<void> {
    for (const sessionId in serializedSessions) {
      const serializedSession = serializedSessions[sessionId];
      const sessionBuffer = Decoder.fromBase64(serializedSession).asBytes.buffer;
      const proteusSession = ProteusSession.Session.deserialise(this.identity!, sessionBuffer);
      const cryptoBoxSession = new CryptoboxSession(sessionId, proteusSession);
      await this.session_save(cryptoBoxSession);
    }
  }

  public async deserialize(payload: SerializedCryptobox): Promise<ProteusKeys.PreKey[]> {
    await this.deleteData();
    await this.importIdentity(payload.identity);
    await this.importPreKeys(payload.prekeys);
    await this.importSessions(payload.sessions);
    return this.refill_prekeys(true);
  }

  public async serialize(): Promise<SerializedCryptobox> {
    const toBase64 = (buffer: ArrayBuffer): string => Encoder.toBase64(buffer).asString;

    const data: SerializedCryptobox = {
      identity: '',
      prekeys: {},
      sessions: {},
    };

    const identity = await this.store.load_identity();

    if (identity) {
      data.identity = toBase64(identity.serialise());
      const sessions = await this.store.read_sessions(identity);
      for (const sessionId in sessions) {
        const storedSession = sessions[sessionId];
        data.sessions[sessionId] = toBase64(storedSession.serialise());
      }
    }

    const storedPreKeys = await this.store.load_prekeys();
    for (const storedPreKey of storedPreKeys) {
      data.prekeys[storedPreKey.key_id] = toBase64(storedPreKey.serialise());
    }

    return data;
  }
}
