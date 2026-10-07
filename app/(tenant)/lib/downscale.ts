/**
 * Jira GRW-558 — a photo is made small before it leaves the phone.
 *
 * The server resizes too (320px WebP for a service, 192px square for a person),
 * so this is not what makes the stored file small. It is what makes the UPLOAD
 * small, and that is the half the owner actually feels: a 4 MB camera-roll
 * photo on a salon's connection is a progress bar, and the same picture leaves
 * at around 120 KB once it has been through here. It also means the box never
 * decodes a 24 megapixel JPEG.
 *
 * **It fails open, always.** Every step is wrapped, and anything that goes
 * wrong — an old browser with no `createImageBitmap`, a codec the canvas will
 * not encode, an image that will not decode here but would on the server —
 * returns the file exactly as it came in. The server's own cap, byte-sniff and
 * pixel guard are the real limits; this is an optimisation in front of them and
 * must never be the reason an upload fails.
 */

/** Long edge after downscaling. Well above anything the server keeps, so it loses nothing. */
export const MAX_UPLOAD_EDGE = 1600;

/** Below this, re-encoding costs more than it saves. */
const ALREADY_SMALL_BYTES = 200 * 1024;

/** What the API accepts. A file of any other type is sent untouched for the server to refuse. */
const SERVER_ACCEPTS = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface DownscaleOptions {
  maxEdge?: number;
  quality?: number;
  /** Injected by the tests; the browser's own by default. */
  createBitmap?: typeof createImageBitmap;
  /**
   * Also injected by the tests. This repo's vitest runs in node with no DOM, and
   * adding jsdom to exercise four lines of canvas would be a dependency bought to
   * make a test possible rather than to make the product work.
   */
  createCanvas?: () => HTMLCanvasElement;
}

export async function downscaleImage(file: File, options: DownscaleOptions = {}): Promise<File> {
  const maxEdge = options.maxEdge ?? MAX_UPLOAD_EDGE;
  const createBitmap = options.createBitmap ?? (typeof createImageBitmap === 'function' ? createImageBitmap : undefined);
  const createCanvas =
    options.createCanvas ?? (typeof document === 'undefined' ? undefined : () => document.createElement('canvas'));
  if (!createBitmap || !createCanvas) return file;

  // A small file that the server already accepts has nothing to gain. A small
  // file it does NOT accept (an iPhone's HEIC) still goes through, because
  // converting it is the difference between an upload that works and one that
  // is refused.
  if (file.size <= ALREADY_SMALL_BYTES && SERVER_ACCEPTS.has(file.type)) return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    // Already within the cap and in an accepted format: re-encoding would only lose detail.
    if (scale === 1 && SERVER_ACCEPTS.has(file.type)) return file;

    const canvas = createCanvas();
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', options.quality ?? 0.82);
    });
    // A browser that cannot encode WebP hands back a PNG, or nothing at all.
    if (!blob || !SERVER_ACCEPTS.has(blob.type)) return file;

    // Only if it actually helped. A small, detailed image can come out of a
    // re-encode LARGER than it went in, and sending the bigger one would be the
    // opposite of the point.
    if (blob.size >= file.size && SERVER_ACCEPTS.has(file.type)) return file;

    return new File([blob], renameTo(file.name, blob.type), { type: blob.type, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

/** Keeps the owner's own filename, with an extension that matches what is actually inside. */
function renameTo(name: string, type: string): string {
  const stem = name.replace(/\.[^./\\]+$/, '') || 'photo';
  const ext = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
  return `${stem}.${ext}`;
}
