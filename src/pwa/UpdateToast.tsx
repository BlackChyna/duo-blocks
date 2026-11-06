/**
 * DUO BLOCKS — update toast.
 * Registers the service worker; when an update is found and installed in the
 * background, shows a toast: "New version available — refresh". The Refresh
 * button tells the waiting worker to SKIP_WAITING, then reloads.
 */
import { useEffect, useRef, useState } from 'react';
import { registerSW } from './register';
import { Toast } from '../components/Shared';

export function UpdateToast() {
  const [updateReady, setUpdateReady] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    let cancelled = false;

    registerSW(registration => {
      const installing = registration?.installing ?? null;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          waitingRef.current = installing;
          if (!cancelled) setUpdateReady(true);
        }
      });
    }).then(registration => {
      // A worker might already be waiting from a previous visit.
      if (registration?.waiting && navigator.serviceWorker.controller) {
        waitingRef.current = registration.waiting;
        if (!cancelled) setUpdateReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function refresh() {
    waitingRef.current?.postMessage({ type: 'SKIP_WAITING' });
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    // Fallback reload in case controllerchange never fires.
    window.setTimeout(() => window.location.reload(), 1200);
  }

  if (!updateReady) return null;
  return <Toast message="New version available — refresh" actionLabel="Refresh" onAction={refresh} />;
}
