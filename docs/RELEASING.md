# Building and releasing

## Package identity

The package is intentionally unscoped: `dsh-document-center`. Before publishing
to npm, confirm the name is available or change it to a scope you own (for
example `@your-org/dsh-document-center`) in `package.json`, `cordis.patch.yml`,
and the client loader `id` in `scripts/build-client.mjs`.

## Build and test

```sh
npm install
npm test
npm run build:client
```

`prepack` reruns the client build, so `client.js` in a tarball is always
generated from `src/client`.

## Tarball / GitHub Release

```sh
npm pack
# produces dsh-document-center-0.1.0.tgz
dsh plugin --profile <name> add ./dsh-document-center-0.1.0.tgz
```

## npm

```sh
npm publish --access public
```

The package includes `src/`, `scripts/`, and `test/` so consumers can rebuild
and audit the bundle. Runtime dependencies are not installed; `client.js`
already contains Milkdown and `index.js` uses only Node built-ins.
