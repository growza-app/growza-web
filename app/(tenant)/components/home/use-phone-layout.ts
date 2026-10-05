'use client';

import { useEffect, useState } from 'react';

/** Whether the phone layout (≤860px, the system's breakpoint) is in force. False on the server and before mount. */
export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}
