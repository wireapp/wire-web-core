# ts-lerna-template

A template for managing TypeScript packages with Lerna.

## Getting started

```bash
# Install dependencies
yarn install

# Link packages
yarn boot

# Test packages
yarn test:all
```

## Release packages

Start with version "0.0.0" in `package.json` when creating a completely new package.

### Release all packages

Publish all packages that have changed:

```bash
yarn release
```

