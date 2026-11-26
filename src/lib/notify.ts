/**
 * Phone notifications for reminders. No server: the open app checks when it starts, when it comes back
 * to the front and every 30 minutes; installed on Android, Chrome also wakes the service worker
 * about twice a day (Periodic Background Sync) to run the same check while the app is closed.
 * "Already sent today" lives in Cache Storage so the app and the service worker share it.
 */
import { db, getSettings } from './db';
import { dueReminders, freshReminders, type Reminder } from './reminders';
import { toISO } from './format';

const SENT_CACHE = 'hisaab-reminders';
const SENT_KEY = './__reminders-sent';

export type NotifyState = 'unsupported' | 'default' | 'granted' | 'denied';

export function notifyState(): NotifyState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotifyState;
}

export async function askPermission(): Promise<NotifyState> {
  if (notifyState() === 'unsupported') return 'unsupported';
  const r = await Notification.requestPermission();
  if (r === 'granted') await registerBackgroundCheck();
  return r as NotifyState;
}

async function readSent(day: string): Promise<string[]> {
  try {
    const res = await (await caches.open(SENT_CACHE)).match(SENT_KEY);
    const j = res ? await res.json() as { day: string; tags: string[] } : null;
    return j && j.day === day ? j.tags : [];
  } catch { return []; }
}

async function writeSent(day: string, tags: string[]): Promise<void> {
  try {
    await (await caches.open(SENT_CACHE)).put(SENT_KEY, new Response(JSON.stringify({ day, tags }), { headers: { 'content-type': 'application/json' } }));
  } catch { /* storage blocked: worst case a reminder repeats */ }
}

async function show(r: Reminder): Promise<void> {
  const opts: NotificationOptions = { body: r.body, tag: r.tag, icon: './icon.svg', badge: './icon.svg', data: { url: r.url } };
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (reg) await reg.showNotification(r.title, opts);
  else new Notification(r.title, opts);
}

/** Show any reminders due now that haven't been shown today. Returns how many were shown. */
export async function checkReminders(now = new Date()): Promise<number> {
  if (notifyState() !== 'granted') return 0;
  const [cards, settings] = await Promise.all([db.cards.toArray(), getSettings()]);
  if (!settings.consentAt) return 0;
  const day = toISO(now);
  const sent = await readSent(day);
  const fresh = freshReminders(dueReminders(cards, settings, now), sent);
  for (const r of fresh) await show(r);
  if (fresh.length) await writeSent(day, [...sent, ...fresh.map(r => r.tag)]);
  return fresh.length;
}

/** A test notification, so you can see what reminders look like. */
export async function sendTest(): Promise<void> {
  await show({ tag: `test-${Date.now()}`, title: 'Hisaab reminders are on', body: 'You will get a nudge the day before a bill is due, and on salary day.', url: '#home' });
}

/** Ask Chrome (installed app, Android) to wake the service worker about twice a day. */
export async function registerBackgroundCheck(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const ps = (reg as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, o: { minInterval: number }) => Promise<void> } })?.periodicSync;
    if (!ps) return;
    const status = await navigator.permissions?.query({ name: 'periodic-background-sync' as PermissionName });
    if (status && status.state !== 'granted') return;
    await ps.register('hisaab-reminders', { minInterval: 12 * 60 * 60 * 1000 });
  } catch { /* not supported here: reminders still run whenever the app is open */ }
}

/** Run while the app is open: on start, when it comes back to the front, and every 30 minutes. */
export function startReminderLoop(): () => void {
  const run = () => { void checkReminders(); };
  const onVis = () => { if (document.visibilityState === 'visible') run(); };
  const first = window.setTimeout(run, 2500);
  const every = window.setInterval(run, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', onVis);
  if (notifyState() === 'granted') void registerBackgroundCheck();
  return () => { clearTimeout(first); clearInterval(every); document.removeEventListener('visibilitychange', onVis); };
}
