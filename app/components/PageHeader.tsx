import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  initial,
  actions,
}: {
  title: string;
  subtitle?: string;
  initial?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions}
      {initial && <div className="avatar-lg">{initial}</div>}
    </header>
  );
}
