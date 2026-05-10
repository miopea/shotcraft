/**
 * Tiny STORE-only ZIP encoder. Produces a Blob containing the given
 * entries with no compression — appropriate for already-compressed
 * payloads like PNGs (DEFLATE on a PNG saves ~0% and just burns CPU).
 *
 * Avoids the ~100KB JSZip dependency for the one place we need a
 * client-side zip (Crawler "Download all"). Implements only what the
 * ZIP spec requires for a valid archive: local file headers, central
 * directory entries, end-of-central-directory record. No data
 * descriptors, no zip64, no encryption.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    if (byte === undefined) continue;
    const idx = (crc ^ byte) & 0xff;
    const tableEntry = CRC_TABLE[idx];
    if (tableEntry === undefined) continue;
    crc = (crc >>> 8) ^ tableEntry;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** UTF-8 filename inside the archive. Forward slashes for subdirs. */
  name: string;
  data: Uint8Array;
}

export function buildStoreZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const lfh = new Uint8Array(30 + nameBytes.length);
    const dvL = new DataView(lfh.buffer);
    dvL.setUint32(0, 0x04034b50, true); // local file header signature
    dvL.setUint16(4, 20, true); // version needed
    dvL.setUint16(6, 0x0800, true); // flags: bit 11 = utf-8 filename
    dvL.setUint16(8, 0, true); // compression: 0 = STORE
    dvL.setUint16(10, 0, true); // mod time
    dvL.setUint16(12, 0x0021, true); // mod date (1996-01-01 — ZIP spec minimum)
    dvL.setUint32(14, crc, true);
    dvL.setUint32(18, size, true);
    dvL.setUint32(22, size, true);
    dvL.setUint16(26, nameBytes.length, true);
    dvL.setUint16(28, 0, true); // extra field length
    lfh.set(nameBytes, 30);
    parts.push(lfh);
    parts.push(entry.data);

    const cdh = new Uint8Array(46 + nameBytes.length);
    const dvC = new DataView(cdh.buffer);
    dvC.setUint32(0, 0x02014b50, true); // central directory header signature
    dvC.setUint16(4, 20, true); // version made by
    dvC.setUint16(6, 20, true); // version needed
    dvC.setUint16(8, 0x0800, true); // flags
    dvC.setUint16(10, 0, true); // STORE
    dvC.setUint16(12, 0, true);
    dvC.setUint16(14, 0x0021, true);
    dvC.setUint32(16, crc, true);
    dvC.setUint32(20, size, true);
    dvC.setUint32(24, size, true);
    dvC.setUint16(28, nameBytes.length, true);
    dvC.setUint16(30, 0, true); // extra
    dvC.setUint16(32, 0, true); // comment length
    dvC.setUint16(34, 0, true); // disk number
    dvC.setUint16(36, 0, true); // internal file attrs
    dvC.setUint32(38, 0, true); // external file attrs
    dvC.setUint32(42, offset, true); // local header relative offset
    cdh.set(nameBytes, 46);
    centralParts.push(cdh);

    offset += lfh.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((n, p) => n + p.length, 0);
  const centralOffset = offset;

  const eocd = new Uint8Array(22);
  const dvE = new DataView(eocd.buffer);
  dvE.setUint32(0, 0x06054b50, true); // EOCD signature
  dvE.setUint16(4, 0, true); // disk number
  dvE.setUint16(6, 0, true); // disk with CD start
  dvE.setUint16(8, entries.length, true); // CD entries on this disk
  dvE.setUint16(10, entries.length, true); // total CD entries
  dvE.setUint32(12, centralSize, true);
  dvE.setUint32(16, centralOffset, true);
  dvE.setUint16(20, 0, true); // archive comment length

  // Cast to BlobPart[]: TS 5.7 narrows new Uint8Array() to
  // Uint8Array<ArrayBufferLike>, which the Blob constructor's
  // BlobPart type rejects (it wants Uint8Array<ArrayBuffer> only).
  // The runtime is identical — Blob accepts any BufferSource.
  const blobParts = [...parts, ...centralParts, eocd] as BlobPart[];
  return new Blob(blobParts, { type: "application/zip" });
}
