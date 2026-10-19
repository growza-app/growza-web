'use client';

import { useEffect } from 'react';
import { guardNumberWheel } from './number-wheel';

/** Mounted once in each root layout: a number field stops taking the scroll wheel as a change to its value. */
export function NumberWheelGuard() {
  useEffect(() => guardNumberWheel(document), []);
  return null;
}
