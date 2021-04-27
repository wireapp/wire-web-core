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

| Scenario | MacBook Air M1 (2020) A2337<br>(8C CPU, 16 GB RAM)<br>Node v16.0.0 |
| --- | :-: |
| Generating "4000" pre-key bundles (single-threaded) | 1461ms |
| Initializing "4000" sessions (single-threaded) | 2967ms |
| Encrypting "4000" texts (single-threaded) | 200ms |
