import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import enMessages from '../../../messages/en.json';
import hiMessages from '../../../messages/hi.json';
import { CLIENT_MESSAGES } from '../../../i18n/client-messages';
import { SETTINGS_GROUPS } from '../settings/nav-data';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf8');

/**
 * Jira GRW-563 — phone check-in: the stylist's "I'm in", the owner's Yes / No, the branch's pin in Settings.
 * These pin the gates, not the pixels: every control sits behind the shared rule, and every word has a Hindi line.
 */
describe('phone check-in', () => {
  it('the stylist’s card asks the shared rule AND the branch before drawing a button', () => {
    const card = read('../components/home/CheckInCard.tsx');
    expect(card).toMatch(/useMayUse\('attendance\.self'\)/);
    expect(card).toMatch(/useSelfCheckIn\(\)/);
    expect(card).toMatch(/if \(!offered \|\| !may\) return null;/);
    // The Home draws it first, where the thumb is.
    expect(read('../components/home/StylistHome.tsx')).toMatch(/<CheckInCard /);
  });

  it('the register’s Yes / No is behind attendance.approve and the read-only switch', () => {
    const register = read('AttendanceRegister.tsx');
    expect(register).toMatch(/useMayUse\('attendance\.approve'\)/);
    expect(register).toMatch(/row\.approval === 'pending' && mayApprove && writable/);
    // A No always carries a reason the stylist reads back.
    expect(register).toMatch(/\['not_at_branch', 'wrong_time', 'other'\]/);
  });

  it('the owner’s Home counts the queue from the session, never a second request', () => {
    expect(read('../components/home/OwnerHome.tsx')).toMatch(/usePendingAttendance\(\)/);
    expect(read('../layout.tsx')).toMatch(/pendingAttendance = me\.attendance\?\.pending \?\? 0/);
  });

  it('Settings lists Location check-in once, in the branch group, and its words reach the browser', () => {
    const rows = SETTINGS_GROUPS.flatMap((g) => g.rows.map((r) => ({ ...r, group: g.key })));
    const row = rows.filter((r) => r.key === 'checkIn');
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ group: 'branch', href: '/settings/check-in' });
    expect(CLIENT_MESSAGES).toContain('settingsCheckIn');
    expect(read('../globals.css')).toMatch(/@import '\.\/styles\/88-check-in\.css';/);
  });

  it('every English line has a Hindi one', () => {
    const keys = (o: unknown, prefix = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(hiMessages.settingsCheckIn).sort()).toEqual(keys(enMessages.settingsCheckIn).sort());
    expect(keys(hiMessages.attendance.checkIn).sort()).toEqual(keys(enMessages.attendance.checkIn).sort());
    expect(hiMessages.settingsHub.rows.checkIn.label).toBeTruthy();
  });

  it('the desk sends its own fix, so a fenced branch does not queue every row it types', () => {
    const register = read('AttendanceRegister.tsx');
    // The API has always measured a branch-scoped write against the fence; nothing sent a fix, so every row
    // the desk typed was written `pending`. Asked only where it is read, and only once per five minutes.
    expect(register).toMatch(/if \(!register\.fenceApplies\) return \{\};/);
    expect(register).toMatch(/fix = await getFix\(\);/);
    // Every one of the three writes carries it, the batch included.
    expect(register.match(/\.\.\.\(await deskFix\(\)\)|\.\.\.fix,/g) ?? []).toHaveLength(3);
    // One fix for a whole "Mark everyone present", not one prompt per person.
    expect(register).toMatch(/const fix = await deskFix\(\);\n\s*for \(const row of unmarked\)/);
    expect(read('../lib/api.ts')).toMatch(/markAttendance: \(input: \{[\s\S]*?accuracyM\?: number \| null;/);
  });

  it('a row says where it came from — the desk’s typing never reads as a phone mark', () => {
    const register = read('AttendanceRegister.tsx');
    // `source`, not `approval`: a desk row is `register`, and the phone wording was a false sentence on it.
    expect(register).toMatch(/function fromPhone\(row: \{ source\?: string \| null \}\)/);
    expect(register).toMatch(/source === 'self' \|\| row\.source === 'self_unverified'/);
    expect(register).toMatch(/tc\(fromPhone\(row\) \? 'pendingRow' : 'pendingDesk'/);
    expect(register).toMatch(/tc\(fromPhone\(row\) \? 'approvedRow' : 'approvedDesk'\)/);
    const en = enMessages.attendance.checkIn as unknown as Record<string, string>;
    expect(en.pendingDesk).not.toMatch(/phone/i);
    expect(en.approvedDesk).not.toMatch(/phone/i);
    expect(en.pendingRow).toMatch(/phone/i);
  });

  it('a phone that cannot say where it is still sends the mark — the API decides', () => {
    const fix = read('../lib/geo-fix.ts');
    expect(fix).toMatch(/finish\(null\)/);
    expect(read('../lib/api.ts')).toMatch(/selfCheckIn: \(fix: GeoFix \| null\) => post<SelfMarkResult>\('\/api\/v1\/attendance\/self\/in', fix \?\? \{\}\)/);
  });
});
