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

import {KeyPair, SecretKey} from '../keys';

describe('KeyPair', () => {
  it('signs a message and verifies the signature', async () => {
    const keyPair = KeyPair.new();
    const message = 'what do ya want for nothing?';
    const signature = keyPair.secret_key.sign(message);
    const badSignature = new Uint8Array(signature);

    badSignature.forEach((_, index) => {
      badSignature[index] = ~badSignature[index];
    });

    expect(keyPair.public_key.verify(signature, message)).toBe(true);
    expect(keyPair.public_key.verify(badSignature, message)).toBe(false);
  });

  it('computes a Diffie-Hellman shared secret', async () => {
    const [keypair_a, keypair_b] = await Promise.all([KeyPair.new(), KeyPair.new()]);
    const shared_a = SecretKey.shared_secret(keypair_b.public_key, keypair_a.secret_key);
    const shared_b = SecretKey.shared_secret(keypair_a.public_key, keypair_b.secret_key);
    expect(shared_a).toEqual(shared_b);
  });
});
