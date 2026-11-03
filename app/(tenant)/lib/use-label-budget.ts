'use client';

import { useEffect, useState, type RefObject } from 'react';
import { labelsThatFit } from './report-buckets';

/**
 * How many labels the chart in `ref` has room for, given the widest one it would print.
 *
 * Measured rather than assumed, because the two things that decide it move independently: the chart's width
 * (the screen) and the label's width (the reader's text size, since type here is set in rem). The text is
 * measured on a canvas in the tick's own font, which is the only way to get the width of a string that is
 * not on the screen yet without laying one out and reading it back.
 */
export function useLabelBudget(ref: RefObject<HTMLElement | null>, widest: string, columns: number): number {
  const [budget, setBudget] = useState(7);

  useEffect(() => {
    const el = ref.current;
    if (!el || !widest || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      const tick = el.querySelector('.cr-bar-tick');
      const style = getComputedStyle(tick ?? el);
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return;
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      setBudget(labelsThatFit(el.clientWidth, ctx.measureText(widest).width, columns));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, widest, columns]);

  return budget;
}
