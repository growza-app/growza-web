'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ReportDates } from './ReportDates';
import { presetRange, REPORT_PRESETS, type ChangedEnd, type ReportPreset } from '../lib/report-dates';

/**
 * Owner, 2026-11-28 (reports UX check, #2) — one period control on every report. Summary asked for two dates, the money
 * tabs asked for two dates AND four chips (two rows, about 130px on a phone), and the stock tabs had a menu. Now the
 * menu everywhere: the periods asked for most, then "Custom dates", which opens the two date fields (owner,
 * 2026-11-02: "the 3rd to the 17th" must stay possible). A period that is no preset (a saved link) opens as custom.
 */
export function ReportPeriod({
  from,
  to,
  today,
  onChange,
}: {
  from: string;
  to: string;
  today: string;
  onChange: (fromISO: string, toISO: string, changed: ChangedEnd) => void;
}) {
  const t = useTranslations('reportPeriod');
  const matched = REPORT_PRESETS.find((k) => {
    const r = presetRange(k, today);
    return r.fromISO === from && r.toISO === to;
  });
  const [custom, setCustom] = useState(matched === undefined);
  const value: ReportPreset | 'custom' = custom || !matched ? 'custom' : matched;

  return (
    <div className="rp-period">
      <select
        className="input srp-select rp-select"
        aria-label={t('label')}
        value={value}
        onChange={(e) => {
          const v = e.target.value as ReportPreset | 'custom';
          if (v === 'custom') {
            setCustom(true);
            return;
          }
          setCustom(false);
          const r = presetRange(v, today);
          onChange(r.fromISO, r.toISO, 'to');
        }}
      >
        {REPORT_PRESETS.map((k) => (
          <option key={k} value={k}>
            {t(`presets.${k}`)}
          </option>
        ))}
        <option value="custom">{t('custom')}</option>
      </select>
      {value === 'custom' ? <ReportDates from={from} to={to} today={today} labels={{ group: t('label'), from: t('from'), to: t('to') }} onChange={onChange} /> : null}
    </div>
  );
}
