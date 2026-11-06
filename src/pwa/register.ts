/**
 * DUO BLOCKS — PWA service-worker registration.
 * The SW is served at /duo-blocks/sw.js (GitHub Pages project path).
 * When a new version is found, onUpdateFound fires with the registration so
 * UpdateToast can offer a refresh once the worker is installed & waiting.
 */

/** Registers '/duo-blocks/sw.js'; resolves null when unsupported or failed. */
export async function registerSW(
  onUpdateFound?: (registration: ServiceWorkerRegistration) => void,
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/duo-blocks/sw.js', {
      scope: '/duo-blocks/',
    });
    registration.addEventListener('updatefound', () => {
      onUpdateFound?.(registration);
    });
    return registration;
  } catch {
    // 404 in dev (base '/') or storage errors — the app still works without the SW.
    return null;
  }
}
