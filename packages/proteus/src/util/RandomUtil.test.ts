/*
 * Wire
 * Copyright (C) 2021 Wire Swiss GmbH
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

import {initProteus} from '../initProteus';
import * as sodium from 'libsodium-wrappers-sumo';
import {HmacDrbgSha256} from './RandomUtil';

beforeAll(async () => {
  await initProteus();
});

describe('NIST 800-90A test vectors', () => {
  it('works with SHA-256 (page 148 of HMAC_DRGB test cases)', () => {
    const vector = {
      entropy:
        '000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F202122232425262728292A2B2C2D2E2F30313233343536',
      nonce: '2021222324252627',
      outputs: [
        'D67B8C1734F46FA3F763CF57C6F9F4F2DC1089BD8BC1F6F023950BFC5617635208C8501238AD7A4400DEFEE46C640B61AF77C2D1A3BFAA90EDE5D207406E5403',
        '8FDAEC20F8B421407059E3588920DA7EDA9DCE3CF8274DFA1C59C108C1D0AA9B0FA38DA5C792037C4D33CD070CA7CD0C5608DBA8B885654639DE2187B74CB263',
      ],
    };

    const drbg = new HmacDrbgSha256();
    drbg.instantiate(sodium.from_hex(vector.entropy), sodium.from_hex(vector.nonce));

    for (const expectedOutputHex of vector.outputs) {
      const output = drbg.generate(expectedOutputHex.length / 2);
      const length = output.length;

      const hexOutput = sodium.to_hex(output).toUpperCase();

      expect(length).toBe(expectedOutputHex.length / 2);
      expect(hexOutput).toBe(expectedOutputHex);
    }
  });

  it('works with SHA-256 (page 154 of HMAC_DRGB test cases)', () => {
    const vector = {
      entropy:
        '000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F202122232425262728292A2B2C2D2E2F30313233343536',
      inputOutputPairs: [
        {
          additionalData:
            '606162636465666768696A6B6C6D6E6F707172737475767778797A7B7C7D7E7F808182838485868788898A8B8C8D8E8F90919293949596',
          outputHex:
            '418787358135419B938133535306176AFB251CDD2BA3798859B566A05CFB1D680EA925856D5B84D56ADAE87045A6BA28D2C908AB75B7CC41431FAC59F38918A3',
        },
        {
          additionalData:
            'a0A1A2A3A4A5A6A7A8A9AAABACADAEAFB0B1B2B3B4B5B6B7B8B9BABBBCBDBEBFC0C1C2C3C4C5C6C7C8C9CACBCCCDCECFD0D1D2D3D4D5D6',
          outputHex:
            '7C067BDDCA81724823D64C69829285BDBFF537716102C1882E202250E0FA5EF3A384CD34A20FFD1FBC91E0C532A8A421BC4AFE3CD47F22323EB4BAE1A0078981',
        },
      ],
      nonce: '2021222324252627',
    };

    const drbg = new HmacDrbgSha256();
    drbg.instantiate(sodium.from_hex(vector.entropy), sodium.from_hex(vector.nonce));

    for (const pair of vector.inputOutputPairs) {
      const output = drbg.generate(pair.outputHex.length / 2, sodium.from_hex(pair.additionalData));
      const length = output.length;

      const hexOutput = sodium.to_hex(output).toUpperCase();

      expect(length).toBe(pair.outputHex.length / 2);
      expect(hexOutput).toBe(pair.outputHex);
    }
  });

  it('works with SHA-256 (CAVP test case SHA-256 nopr 0)', () => {
    const vector = {
      step1: {
        entropy: '00efb9c7f02719ff5c7030ffa897a308d36c11ce27526340728bcd487c80457b',
        nonce: '09cebd489d363b5578ddf30534ee6a7f',
        pers_string: '27e38c624a8f934e931e195a0cbcf38e4e8d50108dc318743fb4b61cf78a7d14',
      },
      step2: {
        additional_input: '0e4dddbe0034180b59303d527a938a447bad9e4a91787d1072e6f41350ff11e5',
        entropy: '4c87234a9bb529aebb7278daa089753bd2b501d30677edb6cc31e38788fe0e21',
      },
      step3: {
        additional_input: 'cb25fccf929812b9fc66aea93e0cafb064e25b8c2989ae5078648ef529ecb487',
      },
      step4: {
        additional_input: 'c1685a422e4a0673cea9948937a8fdaa77777066f501aa17493682a83d931e6a',
        output:
          '7569ff1ad01a56ab283c1f2357bd519e15c0be84b80cfe8ec6e26cf903aa8a17f52311a2458e48468122ce1f4abff12920f7dffa86c46f06d744d198004bdd0b29b1b0f17712863df82406e2c2a2fb73ea99dc3969c7e52aeaea031e0112fbf8d785426ae7c106d876a900ba54c4e9a1f3656990571c6d1fb56131cd1cdb1e68',
      },
    };

    const drbg = new HmacDrbgSha256();
    drbg.instantiate(
      sodium.from_hex(vector.step1.entropy),
      sodium.from_hex(vector.step1.nonce),
      sodium.from_hex(vector.step1.pers_string),
    );
    drbg.reseed(sodium.from_hex(vector.step2.entropy), sodium.from_hex(vector.step2.additional_input));
    drbg.generate(1024 / 8, sodium.from_hex(vector.step3.additional_input));

    const output = drbg.generate(vector.step4.output.length / 2, sodium.from_hex(vector.step4.additional_input));
    const length = output.length;

    const hexOutput = sodium.to_hex(output);

    expect(length).toBe(vector.step4.output.length / 2);
    expect(hexOutput).toBe(vector.step4.output);
  });
});
