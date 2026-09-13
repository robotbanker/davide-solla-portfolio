const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { GalleryZip } = require("../client-download");

test("gallery ZIP preserves full image bytes and validates with an independent ZIP reader", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-zip-"));
  try {
    const zip = new GalleryZip();
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x02, 0xff, 0xd9]);
    await zip.add("0001-photo.jpg", new Blob([photo]));
    await zip.add("0002-portrait.jpg", new Blob([photo, photo]));
    const file = path.join(dir, "gallery.zip");
    await fs.writeFile(file, Buffer.from(await zip.finish().arrayBuffer()));
    assert.match(execFileSync("unzip", ["-t", file], { encoding: "utf8" }), /No errors detected/);
    assert.deepEqual(execFileSync("unzip", ["-p", file, "0001-photo.jpg"]), photo);
    assert.deepEqual(execFileSync("unzip", ["-p", file, "0002-portrait.jpg"]), Buffer.concat([photo, photo]));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
