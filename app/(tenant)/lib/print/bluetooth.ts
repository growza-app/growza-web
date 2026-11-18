/**
 * Jira GRW-713 — a Bluetooth thermal printer, reached from the browser (Web Bluetooth: Chrome on Android, and Chrome
 * or Edge on a laptop; never Safari or an iPhone, which is why the print dialog is always there underneath).
 *
 * ## What it can and cannot reach
 *
 * Web Bluetooth speaks Bluetooth LOW ENERGY only. A printer that is "Classic" Bluetooth alone (SPP) does not appear
 * in the chooser at all; most cheap 58mm printers sold in India are dual-mode and do. The services below are the
 * ones those printers expose for their print stream; the chooser shows every nearby device, because many printers
 * do not advertise any service by name.
 *
 * ## Staying connected
 *
 * The chooser needs a tap, every time, unless the browser lets a page see devices it was already given
 * (`getDevices`, which Chrome has behind a permission backend that is on in some versions and not others). So the
 * connection is kept for as long as the page is open, and re-found through `getDevices` where that exists; where it
 * does not, the next print after a reload asks once more. Nothing here pretends otherwise.
 */

/** Print services of the BLE thermal printers sold under a hundred brand names. */
export const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
];

/** The smallest write every BLE stack accepts is 20 bytes; 180 fits under the MTU nearly all of them negotiate. */
export const CHUNK = 180;

/* The few Web Bluetooth shapes this file uses. The DOM lib does not ship them, and a dependency for six types is not
   worth one. */
interface BtCharacteristic {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse?(v: BufferSource): Promise<void>;
  writeValueWithoutResponse?(v: BufferSource): Promise<void>;
  writeValue?(v: BufferSource): Promise<void>;
}
interface BtService {
  getCharacteristics(): Promise<BtCharacteristic[]>;
}
interface BtServer {
  connected: boolean;
  connect(): Promise<BtServer>;
  getPrimaryServices(): Promise<BtService[]>;
}
export interface BtDevice {
  id: string;
  name?: string;
  gatt?: BtServer;
}
interface BtApi {
  getAvailability?(): Promise<boolean>;
  requestDevice(o: { acceptAllDevices: true; optionalServices: string[] }): Promise<BtDevice>;
  getDevices?(): Promise<BtDevice[]>;
}

function bt(): BtApi | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as unknown as { bluetooth?: BtApi }).bluetooth ?? null;
}

/** True where the browser can reach a Bluetooth printer at all. The settings screen offers it only then. */
export function bluetoothSupported(): boolean {
  return bt() !== null;
}

/**
 * Jira GRW-733 — one connection per printer this device paired with: a counter may print each kitchen station's slips on
 * that station's own printer (the Bar's beside the bar), so the bytes for one never go down another's channel.
 */
const links = new Map<string, { device: BtDevice; channel: BtCharacteristic | null }>();

async function findChannel(d: BtDevice): Promise<BtCharacteristic> {
  if (!d.gatt) throw new PrinterError('no_gatt');
  const server = d.gatt.connected ? d.gatt : await d.gatt.connect();
  for (const service of await server.getPrimaryServices()) {
    for (const c of await service.getCharacteristics()) {
      if (c.properties.write || c.properties.writeWithoutResponse) return c;
    }
  }
  throw new PrinterError('no_channel');
}

export class PrinterError extends Error {
  constructor(readonly code: 'unsupported' | 'cancelled' | 'no_gatt' | 'no_channel' | 'not_paired' | 'write_failed') {
    super(code);
  }
}

/** Ask the person to pick their printer. Must run inside a tap — the browser refuses a chooser nobody asked for. */
export async function pairPrinter(): Promise<{ id: string; name: string }> {
  const api = bt();
  if (!api) throw new PrinterError('unsupported');
  let picked: BtDevice;
  try {
    picked = await api.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
  } catch {
    throw new PrinterError('cancelled');
  }
  links.set(picked.id, { device: picked, channel: await findChannel(picked) });
  return { id: picked.id, name: picked.name ?? '' };
}

/** The printer this device paired with, connected again without a chooser where the browser allows it. */
async function reconnect(savedId: string | null): Promise<BtCharacteristic> {
  const link = savedId ? links.get(savedId) : undefined;
  if (link?.channel && link.device.gatt?.connected) return link.channel;
  if (link) {
    link.channel = await findChannel(link.device);
    return link.channel;
  }
  const api = bt();
  if (!api) throw new PrinterError('unsupported');
  const known = savedId && api.getDevices ? (await api.getDevices()).find((d) => d.id === savedId) : undefined;
  if (!known) throw new PrinterError('not_paired');
  const channel = await findChannel(known);
  links.set(known.id, { device: known, channel });
  return channel;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Send the bytes in chunks. Without-response writes are faster but overrun a small printer's buffer, hence the pause. */
export async function writeToPrinter(data: Uint8Array, savedId: string | null): Promise<void> {
  const c = await reconnect(savedId);
  try {
    for (let i = 0; i < data.length; i += CHUNK) {
      const part = data.slice(i, i + CHUNK);
      if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) {
        await c.writeValueWithoutResponse(part);
        await pause(20);
      } else if (c.writeValueWithResponse) await c.writeValueWithResponse(part);
      else if (c.writeValue) await c.writeValue(part);
      else throw new PrinterError('no_channel');
    }
  } catch (e) {
    const link = savedId ? links.get(savedId) : undefined;
    if (link) link.channel = null;
    throw e instanceof PrinterError ? e : new PrinterError('write_failed');
  }
}

/** Forget a printer's connection (the settings screen's "Remove printer"); with no id, every one this page holds. */
export function forgetPrinter(id?: string): void {
  if (id) links.delete(id);
  else links.clear();
}
