import { useId } from 'react';

/**
 * The Growza mark — growza.biz's sprout on the deep green squircle, path for path the app icon
 * (tools/make-icons.mjs is the source; change both together). Inline SVG, no file: one icon language.
 */
export function GrowzaMark({ size = 36 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E7E45" />
          <stop offset="100%" stopColor="#0A2E20" />
        </linearGradient>
        <linearGradient id={`${id}mint`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#6EE7B7" />
        </linearGradient>
      </defs>
      <rect width="140" height="140" rx="34" fill={`url(#${id}bg)`} />
      <path d="M 58 106 C 34 98, 22 76, 26 48 C 52 52, 64 74, 58 106 Z" fill={`url(#${id}mint)`} />
      <path d="M 65 108 C 62 66, 78 38, 112 28 C 110 68, 94 100, 65 108 Z" fill="#ffffff" />
    </svg>
  );
}
