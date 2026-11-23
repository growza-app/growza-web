import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { encodeTicket, type Rasterize } from './escpos';
import { kotFromApi, slipsOf } from './from-api';
import { DEFAULT_PRINTER, routeOf, settingsForStation, stationKey, type PrinterSettings } from './printer';
import { kotTicket, type KotCopy } from './ticket';

/** Jira GRW-733 — kitchen slips by station: each slip names its station, prints where that station's printer is, and says which did not print. */
const copy: KotCopy = {
  title: 'KITCHEN SLIP',
  added: 'ADDED TO ORDER',
  cancelled: 'CANCELLED',
  packed: 'PACK IT',
  reprint: 'REPRINT',
  kotNo: (n) => `Slip ${n}`,
  token: (n) => `Token #${n}`,
  items: (n) => `${n} items`,
  by: (name) => `By ${name}`,
};
const words = (type: 'dine_in' | 'takeaway' | 'delivery', table: string | null) => (table ? `DINE-IN · ${table}` : type.toUpperCase());
const t5 = { tokenNo: null, channel: 'counter', orderType: 'dine_in' as const, tableName: 'T5 · AC Hall' };
const slip = (station: string | null | undefined, items = [{ name: 'Butter Naan', qty: 2 }], stationId: string | null = null) => ({
  id: 'k',
  number: 12,
  kind: 'new' as const,
  createdAt: '2026-11-18T19:00:00Z',
  items,
  takenBy: 'Ravi',
  ...(station === undefined ? {} : { station, stationId }),
});
const texts = (kot: ReturnType<typeof kotFromApi>) => kotTicket(kot, copy).lines.map((l) => (l.kind === 'text' ? l.text : l.kind === 'pair' ? `${l.left}|${l.right}` : l.kind));
const r: Rasterize = (_line, w) => ({ width: w, height: 1, bits: new Uint8Array(w / 8) });
const printer = readFileSync(join(__dirname, '../../components/TicketPrinter.tsx'), 'utf8');
const screen = readFileSync(join(__dirname, '../../kitchen/KitchenClient.tsx'), 'utf8');
const setup = readFileSync(join(__dirname, '../../settings/kitchen-stations/KitchenStationsSetup.tsx'), 'utf8');
const bluetooth = readFileSync(join(__dirname, './bluetooth.ts'), 'utf8');
const payFlow = readFileSync(join(__dirname, '../../appointments/new/PayFlow.tsx'), 'utf8');

describe('AC-01 — two stations: each slip names its station, both name T5', () => {
  it('the Tandoor slip says TANDOOR under its heading and only the naan; the Bar slip says BAR and only the drink', () => {
    const tandoor = texts(kotFromApi(slip('Tandoor'), t5, () => 'now', false, words));
    const bar = texts(kotFromApi(slip('Bar', [{ name: 'Cold Drink', qty: 1 }], 'b'), t5, () => 'now', false, words));
    expect(tandoor.slice(0, 3)).toEqual(['KITCHEN SLIP', 'TANDOOR', 'DINE-IN · T5 · AC Hall']);
    expect(bar.slice(0, 3)).toEqual(['KITCHEN SLIP', 'BAR', 'DINE-IN · T5 · AC Hall']);
    expect(tandoor).toContain('2 x Butter Naan');
    expect(tandoor).not.toContain('1 x Cold Drink');
    expect(bar).toContain('1 x Cold Drink');
  });

  it('the item table is byte-identical with or without a station: only the station line is new', () => {
    const plain = kotTicket(kotFromApi(slip(undefined), t5, () => 'now', false, words), copy);
    const named = kotTicket(kotFromApi(slip('Tandoor'), t5, () => 'now', false, words), copy);
    const table = (t: typeof plain) => t.lines.slice(t.lines.findIndex((l) => l.kind === 'rule'));
    expect(encodeTicket({ lines: table(named), cut: true }, '58', r)).toEqual(encodeTicket({ lines: table(plain), cut: true }, '58', r));
    expect(named.lines.length).toBe(plain.lines.length + 1);
  });

  it('an answer’s slips are its `kots` where the API sends them, else its one `kot`', () => {
    const a = slip('Tandoor');
    const b = slip('Bar', [{ name: 'Cold Drink', qty: 1 }], 'b');
    expect(slipsOf({ kot: a, kots: [a, b] })).toEqual([a, b]);
    expect(slipsOf({ kot: a })).toBe(a);
    expect(slipsOf({ kot: a, kots: [] })).toBe(a);
    expect(slipsOf({})).toBeUndefined();
  });
});

describe('AC-03 — no stations set: one slip exactly as today', () => {
  it('a slip with no station (or an older API that sends none) prints byte for byte what it printed before', () => {
    const before = kotTicket(kotFromApi(slip(undefined), t5, () => 'now', false, words), copy);
    const none = kotTicket(kotFromApi(slip(null), t5, () => 'now', false, words), copy);
    expect(encodeTicket(none, '58', r)).toEqual(encodeTicket(before, '58', r));
    expect(texts(kotFromApi(slip(null), t5, () => 'now', false, words))).not.toContain('KITCHEN');
  });

  it('this device prints every station on its own printer until told otherwise (settings saved before stations had none)', () => {
    expect(DEFAULT_PRINTER.stations).toEqual({});
    expect(routeOf(DEFAULT_PRINTER, null)).toEqual({ to: 'here' });
    expect(settingsForStation(DEFAULT_PRINTER, 'any')).toBe(DEFAULT_PRINTER);
  });
});

describe('a printer per station, set on the device that prints for it', () => {
  const device: PrinterSettings = {
    ...DEFAULT_PRINTER,
    bluetooth: { id: 'front', name: 'Counter printer' },
    stations: { bar: { to: 'own', bluetooth: { id: 'bar-bt', name: 'Bar printer' } }, [stationKey(null)]: { to: 'off' } },
  };
  it('Bar’s slip goes to the Bar printer, the Kitchen’s is not printed here, Tandoor’s comes out of this printer', () => {
    expect(settingsForStation(device, 'bar')?.bluetooth).toEqual({ id: 'bar-bt', name: 'Bar printer' });
    expect(settingsForStation(device, null)).toBeNull();
    expect(settingsForStation(device, 'tandoor')?.bluetooth).toEqual({ id: 'front', name: 'Counter printer' });
    expect(stationKey(null)).toBe('kitchen');
  });

  it('each paired printer keeps its own connection, so one station’s bytes never go down another’s', () => {
    expect(bluetooth).toContain('const links = new Map<string, { device: BtDevice; channel: BtCharacteristic | null }>();');
    expect(bluetooth).toContain('const link = savedId ? links.get(savedId) : undefined;');
  });

  it('the printer settings list the branch’s stations (only where it has some) with This printer / Its own printer / Not from this device', () => {
    expect(printer).toContain('<StationPrinters printer={printer} />');
    expect(printer).toContain('if (!stations || stations.length === 0) return null;');
    for (const k of ['stationHere', 'stationOwn', 'stationOff', 'stationsTitle', 'stationsHint', 'stationWhere', 'defaultStation'] as const) {
      expect(en.print[k], k).toBeTruthy();
      expect(hi.print[k], k).toBeTruthy();
      expect(hi.print[k]).not.toBe(en.print[k]);
    }
  });
});

describe('AC-02 — a station printer is not reachable', () => {
  it('the other slips still print, and the line names the one that did not: "Bar slip did not print" — Print again', () => {
    expect(printer).toContain('if (!j.station) throw e;');
    expect(printer).toContain('missed.push(j);');
    expect(printer).toContain("message: names.length === 1 ? t('stationFailed', { station: names[0]! }) : t('stationsFailed', { stations: names.join(', ') }),");
    expect(printer).toContain('retry: () => void attempt(missed),');
    expect(printer).toContain("{s.again ? t('printAgain') : t('retry')}");
    expect(en.print.stationFailed.replace('{station}', 'Bar')).toBe('Bar slip did not print');
    expect(en.print.printAgain).toBe('Print again');
    expect(hi.print.stationFailed).toContain('{station}');
    // A table's order goes back to the room: the line is said there, over the map.
    expect(payFlow).toContain('<PrintStatusLine printer={printer} />\n        <TableMap');
  });
});

describe('the Kitchen screen by station', () => {
  it('a tablet picks its station (kept on the tablet), reads only that part, and marks only that part Ready', () => {
    expect(screen).toContain("const STATION_KEY = 'growza.kitchen.station';");
    expect(screen).toContain('const answer = await api.kitchen(location, station);');
    expect(screen).toContain('await api.kitchenReady(c.saleId, true, station);');
    expect(screen).toContain('await api.kitchenReady(u.saleId, false, u.station ?? null);');
    expect(screen).toContain('{stations.length > 0 ? (');
  });

  it('on an all-stations screen each dish says whose it is', () => {
    expect(screen).toContain('{station === null && d.station ? <span className="kd-station">{d.station}</span> : null}');
    for (const k of ['stationAll', 'stationFilterAria', 'stationReadyDone', 'kitchenStation'] as const) {
      expect(en.kitchen[k], k).toBeTruthy();
      expect(hi.kitchen[k], k).toBeTruthy();
    }
  });
});

describe('Settings › Kitchen stations', () => {
  it('names stations, gives each category one (Kitchen by default), and says one slip prints while there are none', () => {
    expect(setup).toContain("<option value=\"\">{t('kitchen')}</option>");
    expect(setup).toContain('api.setCategoryStation(location, c.id, e.target.value || null)');
    expect(setup).toContain("{data.stations.length === 0 ? t('introNone') : t('intro')}");
    for (const [k, v] of Object.entries(en.kitchenStations)) {
      expect(hi.kitchenStations[k as keyof typeof hi.kitchenStations], k).toBeTruthy();
      expect(v).not.toMatch(/KOT/);
    }
    expect(en.settingsHub.rows.kitchenStations.label).toBe('Kitchen stations');
  });
});
