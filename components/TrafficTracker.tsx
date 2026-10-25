'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trafficPath } from '@/lib/traffic-core';

export default function TrafficTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!trafficPath(pathname) || navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== 'visible') return;
      sent = true;
      void fetch('/api/traffic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: crypto.randomUUID(), path: pathname }), keepalive: true }).catch(() => {});
    };
    const timer = setTimeout(send, 500);
    document.addEventListener('visibilitychange', send);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', send); };
  }, [pathname]);
  return null;
}
