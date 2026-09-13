/* Store-only ZIP writer: photos are already compressed, so no recompression is needed. */
(() => {
  const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    return value >>> 0;
  });
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
  };
  class GalleryZip {
    constructor() {
      this.parts = [];
      this.directory = [];
      this.size = 0;
    }
    async add(filename, blob) {
      if (this.size + blob.size > 512 * 1024 * 1024 || this.directory.length >= 65535) {
        throw new Error("This gallery is too large for a browser download. Please contact the studio for delivery.");
      }
      const name = new TextEncoder().encode(filename);
      const crc = crc32(new Uint8Array(await blob.arrayBuffer()));
      const header = new Uint8Array(30 + name.length);
      const local = new DataView(header.buffer);
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(12, 0x0021, true); // 1980-01-01, a valid DOS date.
      local.setUint32(14, crc, true);
      local.setUint32(18, blob.size, true);
      local.setUint32(22, blob.size, true);
      local.setUint16(26, name.length, true);
      header.set(name, 30);
      const entry = new Uint8Array(46 + name.length);
      const central = new DataView(entry.buffer);
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint16(14, 0x0021, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, blob.size, true);
      central.setUint32(24, blob.size, true);
      central.setUint16(28, name.length, true);
      central.setUint32(42, this.size, true);
      entry.set(name, 46);
      this.parts.push(header, blob);
      this.directory.push(entry);
      this.size += header.length + blob.size;
    }
    finish() {
      const end = new Uint8Array(22);
      const view = new DataView(end.buffer);
      view.setUint32(0, 0x06054b50, true);
      view.setUint16(8, this.directory.length, true);
      view.setUint16(10, this.directory.length, true);
      view.setUint32(12, this.directory.reduce((size, entry) => size + entry.length, 0), true);
      view.setUint32(16, this.size, true);
      return new Blob([...this.parts, ...this.directory, end], { type: "application/zip" });
    }
  }
  if (typeof module !== "undefined") module.exports = { GalleryZip };
  else globalThis.GalleryZip = GalleryZip;
})();
