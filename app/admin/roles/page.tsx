'use client';

import { BUSINESS_ROLES, PERMISSION_COLUMNS, PERMISSION_MATRIX, PLATFORM_ROLES } from '../data';
import { Icon } from '../icons';
import { Card, SectionTitle } from '../components/primitives';
import { oklch } from '../tokens';

const LEVEL_LABEL = ['No access', 'View', 'Manage'];
const LEVEL_COLOR = ['oklch(0.6 0.02 155)', 'oklch(0.5 0.1 220)', 'oklch(0.44 0.12 150)'];
const LEVEL_BG = ['oklch(0.95 0.006 150)', 'oklch(0.95 0.035 220)', 'oklch(0.95 0.035 150)'];

function RoleCard({ title, roles }: { title: string; roles: [string, string][] }) {
  return (
    <Card>
      <SectionTitle title={title} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {roles.map(([name, desc], i) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 9, borderBottom: i < roles.length - 1 ? `1px solid ${oklch.divider}` : 'none' }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: 'oklch(0.95 0.02 150)', color: 'oklch(0.42 0.09 152)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icon name="roles" size={15} />
            </span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong }}>{name}</div>
              <div style={{ fontSize: 12, color: oklch.textFaint }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * GRW-65 (business RBAC) and GRW-89 (platform RBAC) side by side, as the
 * design shows them — two separate role systems for two separate planes,
 * never one enum shared between them (ADR-14).
 */
export default function AdminRolesPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <RoleCard title="Platform roles" roles={[...PLATFORM_ROLES]} />
        <RoleCard title="Business roles" roles={[...BUSINESS_ROLES]} />
      </div>

      <Card>
        <SectionTitle title="Business permission matrix" />
        <div className="admin-table-scroll">
          <div style={{ minWidth: 640 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `1.2fr repeat(${PERMISSION_COLUMNS.length}, 1fr)`, padding: '0 6px 10px', fontSize: 11, fontWeight: 800, color: oklch.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <div>Role</div>
              {PERMISSION_COLUMNS.map((h) => (
                <div key={h}>{h}</div>
              ))}
            </div>
            {Object.entries(PERMISSION_MATRIX).map(([role, levels]) => (
              <div key={role} style={{ display: 'grid', gridTemplateColumns: `1.2fr repeat(${PERMISSION_COLUMNS.length}, 1fr)`, alignItems: 'center', padding: '10px 6px', borderTop: `1px solid ${oklch.divider}` }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.28 0.02 155)' }}>{role}</div>
                {levels.map((level, i) => (
                  <div key={i}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: LEVEL_COLOR[level], background: LEVEL_BG[level], padding: '3px 9px', borderRadius: 6 }}>
                      {LEVEL_LABEL[level]}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
