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

export const random_bytes = (length: number): Uint8Array => {
  if (typeof window !== 'undefined' && window.crypto) {
    // browser
    const buffer = new ArrayBuffer(length);
    const bufferView = new Uint8Array(buffer);
    return window.crypto.getRandomValues(bufferView);
  }
  // node
  const crypto = require('crypto');
  return new Uint8Array(crypto.randomBytes(length));
};

export class HmacDrbgSha256 {
  private K: Uint8Array;
  private V: Uint8Array;
  private reseed_counter: number;

  public constructor() {
    this.K = new Uint8Array(32);
    this.V = new Uint8Array(32);
    this.reseed_counter = 0;
  }

  public instantiate(entropy?: Uint8Array, nonce?: Uint8Array, additional_input?: Uint8Array) {
    this.K.fill(0);
    this.V.fill(1);
    this.update(new Uint8Array([...(entropy ?? []), ...(nonce ?? []), ...(additional_input ?? [])]));
    this.reseed_counter = 1;
  }

  public reseed(entropy?: Uint8Array, additional_input?: Uint8Array) {
    this.update(new Uint8Array([...(entropy ?? []), ...(additional_input ?? [])]));
    this.reseed_counter = 1;
  }

  private update(additional_input?: Uint8Array) {
    if (additional_input && additional_input.length > 34_359_738_368) {
      throw new Error('Additional input too long.');
    }
    let K = sodium.crypto_auth_hmacsha256(new Uint8Array([...this.V, 0, ...(additional_input ?? [])]), this.K);
    let V = sodium.crypto_auth_hmacsha256(this.V, K);
    if (additional_input != null) {
      K = sodium.crypto_auth_hmacsha256(new Uint8Array([...V, 1, ...(additional_input ?? [])]), K);
      V = sodium.crypto_auth_hmacsha256(V, K);
    }
    this.K = K;
    this.V = V;
  }

  public generate(length: number, additional_input?: Uint8Array) {
    if (length > 1 << 16) {
      throw new Error('Requested output length too long.');
    }
    if (this.reseed_counter > 281_474_976_710_656) {
      throw new Error('Need reseeding.');
    }
    if (this.reseed_counter === 0) {
      throw new Error('Need instantiating.');
    }
    if (additional_input) {
      this.update(additional_input);
    }
    let temp = new Uint8Array();
    while (temp.length < length) {
      this.V = sodium.crypto_auth_hmacsha256(this.V, this.K);
      temp = new Uint8Array([...temp, ...this.V]);
    }
    const retval = temp.slice(0, length);
    this.update(additional_input);
    this.reseed_counter++;
    return retval;
  }
}

/**
 * A cryptographically secure pseudo-random number generator based DRBG_HMAC with SHA-2 256 bit.
 * The construction meets the requirements of class DRG.3 (Killmann, Schindler, 2011), or
 * class DRG.4, if it's regularly seeded from a PTG.2 or better.
 *
 * **Important note on usage**: This class is designed to be used as a singleton, instances should
 * be retrieved from `get_instance()`. This ensures that the instance receives all external
 * seeding.
 */
export class CSPRNG {
  private static instance: CSPRNG;

  /**
   * Get the singleton instance of this class.
   */
  public static get_instance(): CSPRNG {
    if (!CSPRNG.instance) {
      CSPRNG.instance = new CSPRNG();
    }

    return CSPRNG.instance;
  }

  private readonly drbg: HmacDrbgSha256;
  private seeded: Boolean;

  private constructor() {
    this.drbg = new HmacDrbgSha256();
    this.seeded = false;
  }

  private ensure_seeded() {
    /* For tests, allow seeding with fixed values.
       Otherwise always seed with conventional entropy, to ensure it's not worse than the default.
     */
    if (!this.seeded) {
      this.seed();
    }
  }

  /**
   * Seed or re-seed the generator. Internal state is never reset, only updated.
   * Re-seeding is necessary after 2**48 invocations of `random_bytes()`.
   *
   * @param entropy Optional entropy input to seed the generator with.
   * If `entropy` is not passed or null, will retrieve 32 bytes from the system
   * secure random number generator and use these as entropy.
   */
  public seed(entropy?: Uint8Array) {
    if (!entropy) {
      entropy = random_bytes(32);
    }

    if (!this.seeded) {
      this.drbg.instantiate(entropy);
      this.seeded = true;
    } else {
      this.drbg.reseed(entropy);
    }
  }

  /**
   * Generate random bytes. Will automatically seed from the system secure
   * random number generator, if `seed()` hasn't been called yet.
   *
   * Per https://ia.cr/2018/349: We will always call drbg.generate() with
   * the additional_input argument.
   *
   * Warning: `seed()` needs to be called at least every 2**48 invocations
   * of `random_bytes()`.
   *
   * @param length Number of bytes to return. Maximum value is 2**16.
   * @param additional_input Optional additional data (entropy, random bytes)
   * to be passed to the DRBG generate method. Should be at least 32 bytes of
   * entropy. If not provided, this method will retrieve 32 bytes from the
   * system random number generator and use these.
   */
  public random_bytes(length: number, additional_input?: Uint8Array): Uint8Array {
    this.ensure_seeded();
    if (!additional_input) {
      additional_input = random_bytes(32);
    }
    return this.drbg.generate(length, additional_input);
  }
}
