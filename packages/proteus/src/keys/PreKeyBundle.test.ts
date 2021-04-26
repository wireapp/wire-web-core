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
import {initProteus} from "../initProteus";
import { IdentityKeyPair } from './IdentityKeyPair';
import { PreKey } from './PreKey';
import { PreKeyAuth } from './PreKeyAuth';
import { PreKeyBundle } from './PreKeyBundle';

beforeAll(async () => {
  await initProteus();
});

describe('PreKeyBundle', () => {
  it('creates a bundle', () => {
    const [id_pair, prekey] = [new IdentityKeyPair(), new PreKey(1)];
    const bundle = new PreKeyBundle(id_pair.public_key, prekey);
    expect(bundle.verify()).toBe(PreKeyAuth.UNKNOWN);
  });

  it('creates a valid signed bundle', () => {
    const [id_pair, prekey] = [new IdentityKeyPair(), new PreKey(1)];
    const bundle = PreKeyBundle.signed(id_pair, prekey);
    expect(bundle.verify()).toBe(PreKeyAuth.VALID);
  });

  it('serialises and deserialise an unsigned bundle', () => {
    const [id_pair, prekey] = [new IdentityKeyPair(), new PreKey(1)];
    const bundle = new PreKeyBundle(id_pair.public_key, prekey);

    expect(bundle.verify()).toBe(PreKeyAuth.UNKNOWN);

    const pkb_bytes = bundle.serialise();
    const pkb_copy = PreKeyBundle.deserialise(pkb_bytes);

    expect(pkb_copy.verify()).toBe(PreKeyAuth.UNKNOWN);
    expect(pkb_copy.version).toBe(bundle.version);
    expect(pkb_copy.prekey_id).toBe(bundle.prekey_id);
    expect(pkb_copy.public_key.fingerprint()).toBe(bundle.public_key.fingerprint());
    expect(pkb_copy.identity_key.fingerprint()).toBe(bundle.identity_key.fingerprint());
    expect(pkb_copy.signature).toEqual(bundle.signature);
    expect(sodium.to_hex(new Uint8Array(pkb_bytes))).toBe(sodium.to_hex(new Uint8Array(pkb_copy.serialise())));
  });

  it('serialises and deserialises a signed bundle', () => {
    const [id_pair, prekey] = [new IdentityKeyPair(), new PreKey(1)];
    const bundle = PreKeyBundle.signed(id_pair, prekey);
    expect(bundle.verify()).toBe(PreKeyAuth.VALID);

    const pkb_bytes = bundle.serialise();
    const pkb_copy = PreKeyBundle.deserialise(pkb_bytes);

    expect(pkb_copy.verify()).toBe(PreKeyAuth.VALID);

    expect(pkb_copy.version).toBe(bundle.version);
    expect(pkb_copy.prekey_id).toBe(bundle.prekey_id);
    expect(pkb_copy.public_key.fingerprint()).toBe(bundle.public_key.fingerprint());
    expect(pkb_copy.identity_key.fingerprint()).toBe(bundle.identity_key.fingerprint());
    expect(sodium.to_hex(pkb_copy.signature!)).toBe(sodium.to_hex(bundle.signature!));
    expect(sodium.to_hex(new Uint8Array(pkb_bytes))).toBe(sodium.to_hex(new Uint8Array(pkb_copy.serialise())));
  });

  it('generates a serialised JSON format', async () => {
    const pre_key_id = 72;

    const [identity_key_pair, pre_key] = [new IdentityKeyPair(), new PreKey(pre_key_id)];
    const public_identity_key = identity_key_pair.public_key;
    const pre_key_bundle = new PreKeyBundle(public_identity_key, pre_key);
    const serialised_pre_key_bundle_json = pre_key_bundle.serialised_json();

    expect(serialised_pre_key_bundle_json.id).toBe(pre_key_id);

    const serialised_array_buffer_view = sodium.from_base64(
      serialised_pre_key_bundle_json.key,
      sodium.base64_variants.ORIGINAL,
    );
    const serialised_array_buffer = serialised_array_buffer_view.buffer;
    const deserialised_pre_key_bundle = PreKeyBundle.deserialise(serialised_array_buffer);

    expect(deserialised_pre_key_bundle.public_key).toEqual(pre_key_bundle.public_key);
  });
});
