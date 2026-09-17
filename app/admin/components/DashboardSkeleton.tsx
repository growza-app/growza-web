'use client';

import type { CSSProperties, ReactNode } from 'react';
import { oklch } from '../tokens';
import { QUICK_ACTIONS } from '../dashboard-config';
import { Card } from './primitives';

/**
 * Jira GRW-287 (QA of GRW-276 and GRW-280, D6) — admin Home while it loads,
 * in the SHAPE it will have when it has loaded.
 *
 * The old skeleton was four short bars and four 120px blocks in one column.
 * GRW-276's own UI States asked for "skeleton card, same height as the loaded
 * one", and the revenue placeholder was 162px against a 216px card; GRW-280
 * added a Bookings card the skeleton never learned about; and on a laptop the
 * real page is two columns, so everything jumped sideways as well as down the
 * moment the data arrived.
 *
 * So this is not a separate drawing of the page with guessed heights. It uses
 * the loaded page's own grid classes (`admin-stat-grid`, `admin-dash-cols`,
 * every grid area) so it lays out identically at every breakpoint, and each
 * placeholder is the real line it stands in for — same font size, same text
 * where the text is static — with the glyphs made transparent. A line of
 * transparent 25px text is exactly as tall as a line of visible 25px text,
 * which no hardcoded pixel height can promise across a font change.
 */

const PULSE = 'admin-fade 1.2s ease infinite alternate';

/** A line of text that takes its real height but shows only a pulsing bar. */
function Ghost({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{ display: 'inline-block', color: 'transparent', background: oklch.divider, borderRadius: 6, animation: PULSE, ...style }}
    >
      {children}
    </span>
  );
}

function Block({ style }: { style: CSSProperties }) {
  return <span aria-hidden style={{ display: 'block', background: oklch.divider, animation: PULSE, ...style }} />;
}

/** The shell `RevenueCard` / `BookingsCard` draw themselves in. */
const PANEL: CSSProperties = { background: oklch.surface, border: `1px solid ${oklch.border}`, borderRadius: 16, padding: 16 };

function PanelHeader({ title, aside }: { title: string; aside: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>{title}</h3>
      <span style={{ fontSize: 12, color: oklch.textFaint }}>{aside}</span>
    </div>
  );
}

/** The headline figure and its movement line, as `RevenueCard` and `BookingsCard` both set them. */
function FigureLines({ figure }: { figure: string }) {
  return (
    <>
      <div style={{ fontSize: 25, fontWeight: 800, lineHeight: 1.2 }}>
        <Ghost>{figure}</Ghost>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 3, fontSize: 12 }}>
        <Ghost>↑ 00% vs last month</Ghost>
      </div>
    </>
  );
}

const STAT_LABELS = ['Total businesses', 'New this month', 'Payments failed', 'Cancellations'];
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
/**
 * Six, the full attention registry. An admin whose role hides some rows will
 * see the list shorten on load; every other admin sees nothing move, and the
 * registry is the only honest count to draw before the response says otherwise.
 */
const ATTENTION_ROWS = 6;

export function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} aria-busy="true" aria-label="Loading dashboard">
      <div className="admin-stat-grid">
        {STAT_LABELS.map((label) => (
          <div key={label} className="admin-stat-card" style={{ background: oklch.surface, border: `1px solid ${oklch.border}` }}>
            {/* The icon's own class, so it shrinks to 30px on a phone exactly as the real one does. */}
            <span className="admin-stat-icon" aria-hidden style={{ background: oklch.divider, animation: PULSE }} />
            <div className="admin-stat-label">
              <Ghost>{label}</Ghost>
            </div>
            <div className="admin-stat-value">
              <Ghost>000</Ghost>
            </div>
            <div className="admin-stat-delta">
              <Ghost>↑ 00% vs last month</Ghost>
            </div>
          </div>
        ))}
      </div>

      <div className="admin-dash-cols">
        <Card className="admin-dash-quick">
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Quick actions</h3>
          <div className="admin-quick-grid">
            {QUICK_ACTIONS.map((action) => (
              <div
                key={action.href}
                data-mobile={action.hideOnMobile ? 'hide' : undefined}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 7,
                  padding: '12px 4px 10px',
                  borderRadius: 14,
                  background: oklch.divider,
                  animation: PULSE,
                  minWidth: 0,
                }}
              >
                <span style={{ width: 21, height: 21 }} />
                {/* The real label, invisible — so a label that wraps loaded wraps here too. */}
                <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.25, textAlign: 'center', color: 'transparent' }}>{action.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="admin-dash-revenue" style={PANEL}>
          <PanelHeader title="Revenue" aside="This month" />
          <FigureLines figure="₹0,00,000" />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 92, marginTop: 14 }}>
            {MONTHS.map((m, i) => (
              <div key={m} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Block style={{ width: '100%', maxWidth: 72, height: 30 + i * 8, borderRadius: 6 }} />
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'transparent' }}>{m}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-dash-side">
          <div style={PANEL}>
            <PanelHeader title="Bookings" aside="This month · all businesses" />
            <FigureLines figure="0,000" />
            <Block style={{ height: 10, borderRadius: 6, margin: '14px 0 10px' }} />
            <div className="admin-outcome-legend">
              {['Upcoming', 'Completed', 'No-show', 'Cancelled'].map((label) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0' }}>
                  <Ghost style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</Ghost>
                  <Ghost style={{ fontSize: 13, fontWeight: 800 }}>000 (00%)</Ghost>
                </div>
              ))}
            </div>
          </div>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textMuted }}>Business status</div>
              <Ghost style={{ fontSize: 12 }}>Total 00</Ghost>
            </div>
            <Block style={{ height: 10, borderRadius: 6, marginBottom: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {['Provisioning', 'Active', 'Suspended', 'Churned'].map((label) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                  <Ghost style={{ fontSize: 13, fontWeight: 600 }}>{label}</Ghost>
                  <Ghost style={{ fontSize: 13.5, fontWeight: 800 }}>00 (00%)</Ghost>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="admin-dash-attention">
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Billing attention</h3>
          {Array.from({ length: ATTENTION_ROWS }, (_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '12px 0',
                borderBottom: i === ATTENTION_ROWS - 1 ? 'none' : `1px solid ${oklch.divider}`,
              }}
            >
              <Block style={{ width: 38, height: 38, borderRadius: 11, flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  <Ghost>Payments failed this month</Ghost>
                </div>
                <div style={{ fontSize: 12.5, marginTop: 2 }}>
                  <Ghost>Nothing needs attention.</Ghost>
                </div>
              </div>
            </div>
          ))}
        </Card>

        <Card className="admin-dash-signups">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: oklch.textStrong }}>Recent signups</h3>
            <Ghost style={{ fontSize: 12.5, fontWeight: 700 }}>View all</Ghost>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, overflow: 'hidden', minWidth: 0, paddingBottom: 2 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, flex: '0 0 auto' }}>
                <Block style={{ width: 40, height: 40, borderRadius: '50%', flex: 'none' }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Ghost style={{ fontSize: 12.5, fontWeight: 700 }}>Salon name</Ghost>
                  <Ghost style={{ fontSize: 11 }}>16 Sept</Ghost>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
