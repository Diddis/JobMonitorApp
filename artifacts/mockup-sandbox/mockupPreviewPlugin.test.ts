import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin.ts";

test("native discovery preserves preview filtering and refreshes added/removed files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup discovery "));
  try {
    const plugin = mockupPreviewPlugin();
    assert.equal(typeof plugin.configResolved, "function");
    assert.equal(typeof plugin.buildStart, "function");
    const configure = plugin.configResolved as Function;
    const refresh = plugin.buildStart as Function;
    configure({ root });

    // A missing mockups directory should produce an empty generated module.
    await refresh();
    const output = path.join(root, "src/.generated/mockup-components.ts");
    assert.match(await readFile(output, "utf8"), /export const modules: ModuleMap = \{\n\n\};/);

    const fixtures = [
      "Zebra.tsx",
      "nested/Alpha.tsx",
      "nested/_Helper.tsx",
      "_private/Hidden.tsx",
      "nested/_private/Hidden.tsx",
      ".hidden/Hidden.tsx",
      ".Hidden.tsx",
      "nested/notes.ts",
    ];
    for (const fixture of fixtures) {
      const file = path.join(root, "src/components/mockups", fixture);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "export default function Example() { return null; }\n");
    }
    await refresh();
    const source = await readFile(output, "utf8");
    assert.deepEqual(
      [...source.matchAll(/"(\.\/components\/mockups\/[^"]+)":/g)].map((m) => m[1]),
      ["./components/mockups/Zebra.tsx", "./components/mockups/nested/Alpha.tsx"],
    );
    assert.match(source, /import\("\.\.\/components\/mockups\/nested\/Alpha.tsx"\)/);

    await rm(path.join(root, "src/components/mockups/Zebra.tsx"));
    await writeFile(path.join(root, "src/components/mockups/New.tsx"), "");
    await refresh();
    const updated = await readFile(output, "utf8");
    assert.ok(updated.includes("New.tsx"));
    assert.ok(!updated.includes("Zebra.tsx"));
    await refresh();
    assert.equal(await readFile(output, "utf8"), updated);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
