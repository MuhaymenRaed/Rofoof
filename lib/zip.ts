"use client";

/**
 * Tiny client-side ZIP writer (STORE method, no compression) — enough to bundle
 * an order's artwork into one download without pulling in a dependency. The
 * images are already compressed WebP, so storing them uncompressed is fine.
 */

interface ZipEntry {
  name: string;
  data: Uint8Array<ArrayBuffer>;
}

// Standard CRC-32 (IEEE 802.3 polynomial), computed without a lookup table.
function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function buildZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method: 0 = store
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x21, true); // mod date (1980-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    parts.push(local, e.data);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true); // central dir signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true); // local header offset
    cen.set(nameBytes, 46);
    central.push(cen);

    offset += local.length + size;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end-of-central-dir signature
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true); // central dir offset
  parts.push(...central, end);

  return new Blob(parts, { type: "application/zip" });
}

function extFromUrl(url: string): string {
  const clean = url.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  const slash = clean.lastIndexOf("/");
  const ext = dot > slash ? clean.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : "webp";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Fetch every image URL and download them as a single ZIP. Skips any that fail
 * to load; throws only if none could be fetched.
 */
export async function downloadImagesAsZip(urls: string[], zipName: string): Promise<void> {
  return downloadImageGroupsAsZip([{ folder: "", urls }], zipName);
}

/** One named set of images — becomes a folder inside the ZIP. */
export interface ImageGroup {
  /**
   * Folder name inside the archive, or "" to put the files at the root.
   *
   * Must be ASCII. The local file headers here leave the general-purpose flags
   * at 0, which declares entry names as CP437 rather than UTF-8, so an Arabic
   * folder name would arrive as mojibake in every unzip tool. Callers pass a
   * slug (`stickers`, `store-medals`) and keep the Arabic in the UI.
   */
  folder: string;
  urls: string[];
}

/**
 * Download several named sets as one ZIP, each set in its own folder — so an
 * order whose basket mixed stickers, brooches and posters unpacks as three
 * labelled folders instead of a heap of numbered files the admin has to sort by
 * eye before printing.
 *
 * Numbering restarts inside each folder, and a URL that fails is skipped rather
 * than failing the archive; only a completely empty result throws.
 */
export async function downloadImageGroupsAsZip(
  groups: ImageGroup[],
  zipName: string,
): Promise<void> {
  const entries: ZipEntry[] = [];
  // De-duplicated ACROSS groups: the same design can legitimately appear in two
  // sets (a buyer's upload that is also the product's cover), and a ZIP with two
  // identical files is just a bigger download over a worse connection.
  const seen = new Set<string>();

  for (const group of groups) {
    let indexInGroup = 0;
    for (const url of group.urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = new Uint8Array(await res.arrayBuffer());
        indexInGroup += 1;
        const n = String(indexInGroup).padStart(2, "0");
        const prefix = group.folder ? `${group.folder}/` : "";
        entries.push({ name: `${prefix}${n}.${extFromUrl(url)}`, data });
      } catch {
        /* skip an image that failed to download */
      }
    }
  }

  if (entries.length === 0) throw new Error("no_images");
  triggerDownload(buildZip(entries), zipName);
}
