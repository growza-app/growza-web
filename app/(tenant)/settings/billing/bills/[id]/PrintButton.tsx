'use client';

/** Jira GRW-254 — print this bill (the browser's own print, which also saves a PDF). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
      {label}
    </button>
  );
}
