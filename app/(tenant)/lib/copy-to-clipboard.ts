/**
 * Put text on the clipboard, and say whether it got there.
 *
 * `navigator.clipboard` is missing on an insecure origin and refuses on a denied permission or inside some
 * embedded browsers, so it cannot be the only route and it cannot be fire-and-forget: a button that shows
 * "Copied" on a refused write sends a link nobody has. The fallback is the older select-and-copy, which works
 * where the modern call does not.
 *
 * Returns false when neither worked, so the caller can tell the person to copy it by hand.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // refused — fall through to the select-and-copy route
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    // Off-screen rather than hidden: a display:none element cannot be selected.
    area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
