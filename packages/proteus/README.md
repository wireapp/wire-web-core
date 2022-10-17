# Wire

This repository is part of the source code of Wire. You can find more information at [wire.com](https://wire.com) or by contacting opensource@wire.com.

You can find the published source code at [github.com/wireapp](https://github.com/wireapp).

For licensing information, see the attached LICENSE file and the list of third-party licenses at [wire.com/legal/licenses/](https://wire.com/legal/licenses/).

## Proteus

### Installation

```
yarn add @wireapp/proteus
```

### Usage

```typescript
import {init, keys} from '@wireapp/proteus';

await init();

const yourIdentity = keys.IdentityKeyPair.new();
```

### Performance Benchmark

Run benchmark on main thread:

```
yarn start:benchmark
```

Run benchmark with worker threads:

```
yarn start:benchmark --workers [amount]
```

Results:

| Scenario | MacBook Air M1 (2020) A2337<br>(8C CPU, 16 GB RAM)<br>Node v16.0.0 |
| --- | :-: |
| Generating "4000" pre-key bundles (single-threaded) | 1461ms |
| Initializing "4000" sessions (single-threaded) | 2967ms |
| Encrypting "4000" texts (single-threaded) | 200ms |

### Proteus Error Codes

| Error Code | Type/Error | Reason | Source |
| --: | :-: | :-: | :-- |
| 1 | `ProteusError` | _Default error code_ | [src/errors/ProteusError.ts](src/errors/ProteusError.ts) |
| 100 | `ProteusError`<br>Array consists only of zeros |  | [src/util/ArrayUtil.ts](src/util/ArrayUtil.ts) |
| 101 | `ProteusError`<br>Unable to find PreKey with ID in PreKey store |  | [src/session/Session.ts](src/session/Session.ts) |
| 102 | `ProteusError`<br>Could not find session for tag |  | [src/session/Session.ts](src/session/Session.ts) |
| 103 | `ProteusError`<br>Number of message keys exceed message chain counter gap |  | [src/session/RecvChain.ts](src/session/RecvChain.ts) |
| 104 | `ProteusError`<br>Skipped message keys which exceed the message chain counter gap |  | [src/session/RecvChain.ts](src/session/RecvChain.ts) |
|  |  |  |  |
| 2 | `DecryptError`<br>Unknown decryption error | _Default error code_ | [src/errors/DecryptError.ts](src/errors/DecryptError.ts) |
| 200 | `DecryptError`<br>Unknown message type | Remote side does not follow proteus specification | [src/session/Session.ts](src/session/Session.ts) |
| 201 | `DecryptError.InvalidMessage`<br>Can't initialise a session from a CipherMessage. | Occurs when the remote party thinks we have an initialised session, but it does not/no longer exist locally. We must have confirmed the session with the remote party by sending them a message. Until then then they continue to send us PreKeyMessages instead of CipherMessages. We prematurely deleted the session before decrypting all events. | [src/session/Session.ts](src/session/Session.ts) |
| 202 | `DecryptError.InvalidMessage`<br>Unknown message format: The message is neither a "CipherMessage" nor a "PreKeyMessage". | Remote side does not follow proteus specification | [src/session/Session.ts](src/session/Session.ts) |
| 203 | `DecryptError.PrekeyNotFound`<br>Could not delete PreKey |  | [src/session/Session.ts](src/session/Session.ts) |
| 204 | `DecryptError.RemoteIdentityChanged`<br>Remote identity changed | Client of the user has changed without informing us (Man in the middle attack? or database conflicts on the remote side: sessions get mixed with new client) | [src/session/Session.ts](src/session/Session.ts) |
| 205 | `DecryptError.InvalidMessage`<br>No matching session tag. | Usually happens when we receive a message intended for another client. | [src/session/Session.ts](src/session/Session.ts) |
| 206 | `DecryptError.InvalidSignature`<br>Decryption of a message in sync failed | Envelope mac key verification failed | [src/session/SessionState.ts](src/session/SessionState.ts) |
| 207 | `DecryptError.InvalidSignature`<br>Decryption of a newer message failed | Envelope mac key verification failed. Session broken or out of sync. Reset the session and decryption is likely to work again! | [src/session/SessionState.ts](src/session/SessionState.ts) |
| 208 | `DecryptError.OutdatedMessage`<br>Message is out of sync | Opposite of "Too distant future" error | [src/session/RecvChain.ts](src/session/RecvChain.ts) |
| 209 | `DecryptError.DuplicateMessage`<br>Duplicate message | Happens if an encrypted message is decrypted twice | [src/session/RecvChain.ts](src/session/RecvChain.ts) |
| 210 | `DecryptError.InvalidSignature`<br>Decryption of a previous (older) message failed | Envelope mac key verification | [src/session/RecvChain.ts](src/session/RecvChain.ts) |
| 211 | `DecryptError.TooDistantFuture`<br>Message is from too distant in the future | More than 1000 messages at the beginning of the receive chain were skipped | [src/session/RecvChain.ts](src/session/RecvChain.ts) |
| 212 | `DecryptError.TooDistantFuture`<br>Message is from too distant in the future | More than 1000 messages on the receive chain were skipped | [src/session/RecvChain.ts](src/session/RecvChain.ts) |
| 213 | `DecryptError.InvalidMessage`<br>Sender failed to encrypt a message. | Error on receiver side when remote side sends a `💣` | - |
|  |  |  |  |
| 3 | `DecodeError`<br>Unknown decoding error | _Default error code_ | [src/errors/DecodeError.ts](src/errors/DecodeError.ts) |
| 300 | `DecodeError.LocalIdentityChanged` |  | [src/session/Session.ts](src/session/Session.ts) |
| 301 | `DecodeError.InvalidType`<br>Malformed message data |  | [src/session/Session.ts](src/session/Session.ts) |
| 302 | `DecodeError.InvalidType`<br>Unrecognised message type |  | [src/message/Envelope.ts](src/message/Envelope.ts) |
| 303 | `DecodeError.InvalidArrayLen`<br> Session tag should be 16 bytes, not $N bytes. |  | [src/message/SessionTag.ts](src/message/SessionTag.ts) |
|  |  |  |  |
| 4 | `InputError`<br>Invalid input | _Default error code_ | [src/errors/InputError.ts](src/errors/InputError.ts) |
| 400 | _reserved_ |  | - |
| 401 | _reserved_ |  | - |
| 402 | _reserved_ |  | - |
| 403 | _reserved_ |  | - |
| 404 | _reserved_ |  | - |
| 405 | `InputError.TypeError`<br> Given CipherMessage doesn't match expected signature. |  | [src/message/CipherMessage.ts](src/message/PreKeyMessage.ts) |
| 406 | `InputError.TypeError`<br> Given PreKeyMessage doesn't match expected signature. |  | [src/message/PreKeyMessage.ts](src/message/PreKeyMessage.ts) |
| 407 | `InputError.TypeError`<br> Given RootKey doesn't match expected signature. |  | [src/session/RootKey.ts](src/session/RootKey.ts) |
| 408 | _reserved_ |  | - |
| 409 | _reserved_ |  | - |
