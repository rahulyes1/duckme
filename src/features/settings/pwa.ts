import { useEffect, useState } from 'react';

/** Registers the offline service worker. Production builds only, so dev HMR is never cached. */
export function registerSW(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
  });
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Captured at module load so an event that fires before the settings screen mounts is not lost.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach(f => f());
  });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()); });
}

/** `canInstall` is true once the browser offered installation; `install()` shows its prompt. */
export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<boolean> } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick(n => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return {
    canInstall: deferred !== null,
    install: async () => {
      const ev = deferred;
      if (!ev) return false;
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      deferred = null;
      listeners.forEach(f => f());
      return outcome === 'accepted';
    },
  };
}
