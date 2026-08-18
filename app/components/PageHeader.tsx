export function PageHeader({
  title,
  subtitle,
  initial,
}: {
  title: string;
  subtitle?: string;
  initial?: string;
}) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {initial && <div className="avatar-lg">{initial}</div>}
    </header>
  );
}
