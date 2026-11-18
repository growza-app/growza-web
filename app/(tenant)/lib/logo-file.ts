import { downscaleImage } from './downscale';

/**
 * Jira GRW-728 — the business logo the owner picked, made ready to upload, or the reason it cannot be.
 *
 * PNG, JPG or SVG (story validation); a WebP, which this screen always took, still goes through. An SVG is drawn into a
 * PNG here, in the browser, and never leaves the phone as SVG: an SVG is a document that can carry script, and the
 * server keeps to the picture formats it can check byte by byte. Then the usual shrinking (GRW-558), and a logo still
 * over 2 MB after it is refused with its size, so the owner knows how far over it is.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** What the file input offers. */
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp,.svg';

export type LogoKind = 'png' | 'jpg' | 'svg' | 'webp';

/** The kind of picture this is, by its type or, where the phone did not say, its name; null when it is not one we take. */
export function logoKind(type: string, name: string): LogoKind | null {
  const t = type.toLowerCase();
  if (t === 'image/png') return 'png';
  if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg';
  if (t === 'image/svg+xml') return 'svg';
  if (t === 'image/webp') return 'webp';
  if (t !== '') return null;
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return ext === 'png' ? 'png' : ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'svg' ? 'svg' : ext === 'webp' ? 'webp' : null;
}

/** "2.4 MB", for the refusal. Always one decimal, and never "2.0 MB" for something over the line. */
export function megabytes(bytes: number): string {
  return `${(Math.ceil((bytes / 1024 / 1024) * 10) / 10).toFixed(1)} MB`;
}

export type PreparedLogo = { ok: true; file: File } | { ok: false; reason: 'type' } | { ok: false; reason: 'size'; size: string };

/** An SVG's long edge once drawn. Well above the 384px the server keeps, so the logo loses nothing. */
const SVG_EDGE = 800;

async function svgToPng(file: File): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // An SVG with no width and height of its own decodes at 0 × 0 in some browsers, or 150 × 150 in others.
    const w = img.naturalWidth || SVG_EDGE;
    const h = img.naturalHeight || SVG_EDGE;
    const scale = SVG_EDGE / Math.max(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    return new File([blob], file.name.replace(/\.svg$/i, '') + '.png', { type: 'image/png' });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareLogo(file: File, shrink: (f: File) => Promise<File> = downscaleImage): Promise<PreparedLogo> {
  const kind = logoKind(file.type, file.name);
  if (!kind) return { ok: false, reason: 'type' };
  let picture: File = file;
  if (kind === 'svg') {
    const png = await svgToPng(file);
    // An SVG this browser cannot draw is no more use to the server than a PDF.
    if (!png) return { ok: false, reason: 'type' };
    picture = png;
  }
  const small = await shrink(picture);
  if (small.size > LOGO_MAX_BYTES) return { ok: false, reason: 'size', size: megabytes(small.size) };
  return { ok: true, file: small };
}
