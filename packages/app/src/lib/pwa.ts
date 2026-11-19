/**
 * Service worker registration. Updates wait for the worker to tap "Reload" so a
 * half-filled form is never lost.
 */
import { registerSW } from "virtual:pwa-register";

export function setupPwa(handlers: {
  onNeedRefresh: (reload: () => void) => void;
  onOfflineReady?: () => void;
}): void {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      handlers.onNeedRefresh(() => void update(true));
    },
    onOfflineReady() {
      handlers.onOfflineReady?.();
    },
    onRegisteredSW(_url, registration) {
      // Check for a new version every hour while the app stays open.
      if (registration) window.setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
}
