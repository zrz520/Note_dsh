import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DocumentLibrary } from "../lib/library.js";

async function fixture() {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), "dsh-doc-center-")));
  const root = path.join(base, "library");
  await mkdir(path.join(root, "notes"), { recursive: true });
  await writeFile(path.join(root, "readme.md"), "# Hello\n\nbody\n");
  await writeFile(path.join(root, "notes", "todo.md"), "- [ ] task\n");
  await writeFile(path.join(root, "notes", "ignore.txt"), "no\n");
  await writeFile(path.join(root, ".hidden.md"), "hidden\n");
  const outside = path.join(base, "outside.md");
  await writeFile(outside, "outside\n");
  await symlink(outside, path.join(root, "linked.md"));
  const configPath = path.join(base, "state", "document-center.json");
  return { base, root, outside, configPath, library: new DocumentLibrary({ configPath }) };
}

test("lists only markdown files and real directories", async (t) => {
  const { root, configPath, library } = await fixture();
  t.after(() => rm(path.dirname(path.dirname(configPath)), { recursive: true, force: true }));

  assert.equal(await library.state(), null);
  const state = await library.selectRoot(root);
  assert.equal(state.rootName, "library");
  assert.deepEqual(
    state.entries.map((entry) => `${entry.kind}:${entry.path}`).sort(),
    ["document:notes/todo.md", "document:readme.md", "folder:notes"],
  );
  const raw = JSON.parse(await readFile(configPath, "utf8"));
  assert.deepEqual(raw, { version: 1, rootPath: root });
});

test("opens, saves with revision guards, and refuses stale writes", async (t) => {
  const { root, configPath, library } = await fixture();
  t.after(() => rm(path.dirname(path.dirname(configPath)), { recursive: true, force: true }));
  await library.selectRoot(root);

  const opened = await library.openDocument("readme.md");
  assert.equal(opened.content, "# Hello\n\nbody\n");
  const saved = await library.saveDocument({ path: "readme.md", content: "# Hi\n", revision: opened.revision });
  assert.equal(saved.content, "# Hi\n");
  await assert.rejects(
    () => library.saveDocument({ path: "readme.md", content: "# Stale\n", revision: opened.revision }),
    (error) => error.code === "DOCUMENT_LIBRARY_CONFLICT",
  );
  assert.equal(await readFile(path.join(root, "readme.md"), "utf8"), "# Hi\n");
});

test("creates folders and documents without escaping the library", async (t) => {
  const { root, configPath, library } = await fixture();
  t.after(() => rm(path.dirname(path.dirname(configPath)), { recursive: true, force: true }));
  await library.selectRoot(root);

  const folder = await library.createFolder("", "journal");
  assert.equal(folder.path, "journal");
  const created = await library.createDocument("journal", "2026-11-16");
  assert.equal(created.entry.path, "journal/2026-11-16.md");
  assert.equal(created.document.content, "# 2026-11-16\n");

  await assert.rejects(() => library.openDocument("../outside.md"), (error) => error.code === "DOCUMENT_LIBRARY_PATH");
  await assert.rejects(() => library.openDocument("linked.md"), (error) => error.code === "DOCUMENT_LIBRARY_PATH");
  await assert.rejects(() => library.createFolder("", "a/b"), (error) => error.code === "DOCUMENT_LIBRARY_NAME");
  await assert.rejects(() => library.createFolder("", "journal"), (error) => error.code === "DOCUMENT_LIBRARY_EXISTS");
});

test("canonicalizes a selected symlink and rejects a stored symlink", async (t) => {
  const { base, root, configPath, library } = await fixture();
  t.after(() => rm(base, { recursive: true, force: true }));
  const link = path.join(base, "link-root");
  await symlink(root, link);

  const selected = await library.selectRoot(link);
  assert.equal(selected.rootPath, root);

  await writeFile(configPath, JSON.stringify({ version: 1, rootPath: link }));
  await assert.rejects(() => library.state(), (error) => error.code === "DOCUMENT_LIBRARY_ROOT_MISSING");
  await assert.rejects(() => library.selectRoot(path.join(base, "missing")), (error) => error.code === "DOCUMENT_LIBRARY_ROOT_MISSING");
});

test("imports markdown contents and rolls back on conflicts", async (t) => {
  const { root, configPath, library } = await fixture();
  t.after(() => rm(path.dirname(path.dirname(configPath)), { recursive: true, force: true }));
  await library.selectRoot(root);

  const imported = await library.importContents("", [
    { name: "a.md", content: "# A\n" },
    { name: "b.md", content: "# B\n" },
  ]);
  assert.deepEqual(imported.map((entry) => entry.path).sort(), ["a.md", "b.md"]);
  assert.equal(await readFile(path.join(root, "a.md"), "utf8"), "# A\n");

  await assert.rejects(
    () => library.importContents("", [
      { name: "c.md", content: "# C\n" },
      { name: "readme.md", content: "# conflict\n" },
    ]),
    (error) => error.code === "DOCUMENT_LIBRARY_EXISTS",
  );
  await assert.rejects(() => readFile(path.join(root, "c.md"), "utf8"), { code: "ENOENT" });
  await assert.rejects(
    () => library.importContents("", [{ name: "note.txt", content: "x" }]),
    (error) => error.code === "DOCUMENT_LIBRARY_TYPE",
  );
});

test("renames documents and folders without leaving stale paths", async (t) => {
  const { root, configPath, library } = await fixture();
  t.after(() => rm(path.dirname(path.dirname(configPath)), { recursive: true, force: true }));
  await library.selectRoot(root);

  const document = await library.renameEntry({ kind: "document", path: "readme.md", name: "intro" });
  assert.equal(document.path, "intro.md");
  assert.equal(await readFile(path.join(root, "intro.md"), "utf8"), "# Hello\n\nbody\n");
  await assert.rejects(() => readFile(path.join(root, "readme.md"), "utf8"), { code: "ENOENT" });

  const folder = await library.renameEntry({ kind: "folder", path: "notes", name: "journal" });
  assert.equal(folder.path, "journal");
  const state = await library.state();
  assert.ok(state.entries.some((entry) => entry.path === "journal/todo.md"));
  assert.equal(await readFile(path.join(root, "journal", "todo.md"), "utf8"), "- [ ] task\n");

  await assert.rejects(() => library.renameEntry({ kind: "folder", path: "", name: "root2" }), (error) => error.code === "DOCUMENT_LIBRARY_RENAME_ROOT");
  await writeFile(path.join(root, "other.md"), "other\n");
  await assert.rejects(() => library.renameEntry({ kind: "document", path: "intro.md", name: "other.md" }), (error) => error.code === "DOCUMENT_LIBRARY_EXISTS");
  await assert.rejects(() => library.renameEntry({ kind: "document", path: "intro.md", name: "a/b" }), (error) => error.code === "DOCUMENT_LIBRARY_NAME");
  await assert.rejects(() => library.renameEntry({ kind: "document", path: "intro.md", name: "note.txt" }), (error) => error.code === "DOCUMENT_LIBRARY_TYPE");
});

test("lists and reads images and HTML without allowing markdown editing", async (t) => {
  const { root, configPath, library } = await fixture();
  t.after(() => rm(path.dirname(path.dirname(configPath)), { recursive: true, force: true }));
  await library.selectRoot(root);

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=", "base64");
  await writeFile(path.join(root, "photo.png"), png);
  await writeFile(path.join(root, "page.html"), "<!doctype html><h1>hello</h1>");

  const state = await library.state();
  assert.ok(state.entries.some((entry) => entry.kind === "image" && entry.path === "photo.png"));
  assert.ok(state.entries.some((entry) => entry.kind === "html" && entry.path === "page.html"));

  const image = await library.openFile("photo.png");
  assert.equal(image.kind, "image");
  assert.equal(image.mime, "image/png");
  assert.deepEqual(Buffer.from(image.base64, "base64"), png);

  const html = await library.openFile("page.html");
  assert.equal(html.kind, "html");
  assert.match(html.content, /<h1>hello<\/h1>/);

  await assert.rejects(() => library.openFile("readme.md"), (error) => error.code === "DOCUMENT_LIBRARY_UNSUPPORTED");
  await assert.rejects(() => library.openFile("../outside.md"), (error) => error.code === "DOCUMENT_LIBRARY_PATH");
  await assert.rejects(() => library.openFile("linked.md"), (error) => error.code === "DOCUMENT_LIBRARY_PATH");
});

test("rejects Windows-reserved names and supports case-only renames", async (t) => {
  const { root, configPath, library } = await fixture();
  t.after(() => rm(path.dirname(path.dirname(configPath)), { recursive: true, force: true }));
  await library.selectRoot(root);

  for (const name of ["CON", "con.md", "LPT1", "a:b", "name."]) {
    await assert.rejects(
      () => library.createFolder("", name),
      (error) => error.code === "DOCUMENT_LIBRARY_NAME",
      `expected ${JSON.stringify(name)} to be rejected`,
    );
  }

  const renamed = await library.renameEntry({ kind: "document", path: "readme.md", name: "README.md" });
  assert.equal(renamed.path, "README.md");
  assert.equal(await readFile(path.join(root, "README.md"), "utf8"), "# Hello\n\nbody\n");
});
