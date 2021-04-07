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

#### Node.js

- [demo.js](./src/demo/demo.js)

#### TypeScript

```typescript
import Proteus from '@wireapp/proteus';

const identity: Proteus.keys.IdentityKeyPair = await Proteus.keys.IdentityKeyPair.new();
```