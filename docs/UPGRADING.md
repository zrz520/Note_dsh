# DSH compatibility and upgrades

`dsh-document-center` targets DSH **0.2.x**. The current verified version is
**0.2.2-rc.1** on macOS Desktop.

## Coupled seams

- Host: `ctx.connection.fetch.register` for `/api/document-center`, and
  `ctx.directoryPicker.capability().pick()` for the native folder picker.
- Client: `ctx.slots` (`main`, `sidebar.panellist`), `ctx.locale`, and the
  client module loader. All `window.__ModuleLoader__` access is isolated in
  `scripts/build-client.mjs`'s wrapper; if DSH changes the loader contract,
  update that wrapper only.
- Client bundle: React is external and supplied by the shell; Milkdown and the
  theme CSS are bundled.

## After a DSH upgrade

1. Update `engines.dsh` only after the checks below pass.
2. `npm install && npm run build:client`
3. Reinstall or reload the bundle in the profile.
4. Smoke-check:
   - sidebar entry appears and the panel renders;
   - the tree lists Markdown, images, and HTML;
   - open/save a Markdown document, including a stale-revision save;
   - `/` menu opens, filters, and inserts a block;
   - image preview renders and HTML preview stays sandboxed;
   - the native folder picker opens (desktop local);
   - switch DSH language and verify Chinese/English labels.

If boot reports that the client module loader is unavailable, the shell loader
contract changed. Do not bypass the guard; update the adapter and retest.
