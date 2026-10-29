'use client';

import type { ShopDaySummary } from '../../lib/api';
import type { HomeCopy } from '../../lib/home-copy';
import { rupees } from './parts';

/**
 * The end of a SHOP's day — the body of the same sheet a salon opens, for a business with no diary.
 *
 * The diary's rows are not hidden here, they are absent from the answer: a counter takes no bookings, nobody
 * fails to turn up for one, and nobody is on shift against one. What is left is the question an owner cashing
 * up actually asks — how much, how many, where from, and what sold.
 *
 * A separate body rather than conditionals through the diary one: there is no row the two share except the
 * branch split, and a sheet written as "if shop … else …" twelve times over is how one screen becomes two
 * screens that drift.
 */
export function ShopDayBody({ t, data, onOpenBranch }: { t: HomeCopy; data: ShopDaySummary; onOpenBranch: (branch: { id: string; name: string }) => void }) {
  return (
    <div className="hm-sheet-grid">
      <section className="hm-hero hm-hero-small">
        <div className="hm-eyebrow">{t.moneyTaken}</div>
        <div className="hm-hero-amount">{rupees(data.takingsMinor)}</div>
        <div className="hm-hero-stats">
          <span>
            <strong>{data.orders}</strong> {t.shop.orderWord(data.orders)}
          </span>
        </div>
      </section>

      {/* The split, directly under the total it splits — the rule the diary sheet follows (Jira GRW-450). */}
      {data.branches && data.branches.length > 0 ? (
        <section className="hm-card hm-sheet-wide">
          <div className="hm-card-head">
            <h2>
              {t.eachBranch} <small>{t.eachBranchSub}</small>
            </h2>
          </div>
          <ul className="hm-rows">
            {data.branches.map((b) => (
              <li key={b.id}>
                <button type="button" className="hm-row hm-row-btn" onClick={() => onOpenBranch({ id: b.id, name: b.name })}>
                  <span className="hm-row-main">
                    <span className="hm-row-name">{b.name}</span>
                  </span>
                  <span className="hm-row-meta">{t.shop.orderCount(b.orders)}</span>
                  <span className="hm-row-amount">{rupees(b.takingsMinor)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.byChannel.length > 0 ? (
        <section className="hm-card">
          <div className="hm-card-head">
            <h2>{t.shop.whereFrom}</h2>
          </div>
          <ul className="hm-rows">
            {data.byChannel.map((c) => (
              <li key={c.channel} className="hm-row">
                {/* The channel's own name as the shop connected it — never translated, never prettified. */}
                <span className="hm-row-main">
                  <span className="hm-row-name">{c.channel}</span>
                </span>
                <span className="hm-row-meta">{t.shop.orderCount(c.orders)}</span>
                <span className="hm-row-amount">{rupees(c.billedMinor)}</span>
              </li>
            ))}
          </ul>
          {/*
            Billed, not received. The API sends the sentence the Channels report already uses rather than this
            screen inventing a second way to say the same caution about the same number.
          */}
          <p className="field-hint">{data.channelCaveat}</p>
        </section>
      ) : null}

      <section className="hm-card">
        <div className="hm-card-head">
          <h2>
            {t.shop.whatSold} <small>{t.shop.whatSoldSub}</small>
          </h2>
        </div>
        {data.topSellers.length === 0 ? (
          <p className="field-hint">{t.shop.nothingSold}</p>
        ) : (
          <ul className="hm-rows">
            {data.topSellers.map((s) => (
              <li key={`${s.name}-${s.sizeLabel ?? ''}`} className="hm-row">
                <span className="hm-row-main">
                  <span className="hm-row-name">
                    {s.name}
                    {s.sizeLabel ? ` · ${s.sizeLabel}` : ''}
                  </span>
                </span>
                <span className="hm-row-meta">{t.soldCount(s.units)}</span>
                <span className="hm-row-amount">{rupees(s.takingsMinor)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
