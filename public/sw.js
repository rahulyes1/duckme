/* Hisaab offline service worker. Bump VERSION to drop old caches after a deploy. */
const VERSION = 'hisaab-v1';
const SHELL = `${VERSION}-shell`;
const FONTS = `${VERSION}-fonts`;
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const REMINDERS = 'hisaab-reminders'; // shared with src/lib/notify.ts

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION) && k !== REMINDERS).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const putIfOk = (cacheName, req, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(cacheName).then(c => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: stale-while-revalidate.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(FONTS).then(async cache => {
        const hit = await cache.match(req);
        const net = fetch(req).then(res => putIfOk(FONTS, req, res)).catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }

  // Everything else cross-origin goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Page navigations: network first so a new deploy shows up, cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => putIfOk(SHELL, './index.html', res))
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./')) || Response.error()),
    );
    return;
  }

  // Same-origin assets (hashed by Vite): cache first, network fallback.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => putIfOk(SHELL, req, res))),
  );
});


/* ---------------- reminders ----------------
 * Same rules as src/lib/reminders.ts (keep in step). Runs when Chrome wakes us for Periodic Background
 * Sync (installed app on Android, roughly twice a day), so bill reminders arrive even with the app closed.
 */
const pad2 = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');

function readAll(dbName, store) {
  return new Promise(resolve => {
    const open = indexedDB.open(dbName);
    open.onerror = () => resolve([]);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(store)) { db.close(); resolve([]); return; }
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => { resolve(req.result || []); db.close(); };
      req.onerror = () => { resolve([]); db.close(); };
    };
  });
}

function dueReminders(cards, settings, now) {
  const prefs = settings.reminders || { bills: true, salary: true, hour: 9 };
  const today = iso(now);
  const stamp = `${today}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const own = cards
    .filter(c => c.reminder && c.reminder.startsWith(today) && c.reminder <= stamp && (c.status === 'open' || c.status === 'delayed'))
    .map(c => ({ tag: `card-${c.id}-${c.reminder}`, title: c.locked ? 'Locked note' : c.title || 'Reminder', body: 'You asked to be reminded now.', url: c.type === 'bill' ? '#money' : '#home' }));
  if (now.getHours() < prefs.hour) return own;
  const tomorrow = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const out = [...own];
  if (prefs.bills) {
    cards.filter(c => c.type === 'bill' && (c.status === 'open' || c.status === 'delayed') && c.due && c.due <= tomorrow && !c.autopay)
      .sort((a, b) => (a.due < b.due ? -1 : 1))
      .forEach(b => {
        const when = b.due === tomorrow ? 'due tomorrow' : b.due === today ? 'due today' : `overdue since ${b.due.slice(8, 10)}-${b.due.slice(5, 7)}`;
        out.push({
          tag: `bill-${b.id}-${b.due}-${today}`,
          title: `${b.title || 'Bill'} · ${b.amount ? inr(b.amount) + ' ' : ''}${when}`,
          body: b.penalty ? `Pay to avoid: ${b.penalty}` : 'Tap to open, then swipe right or tap Paid once it is done.',
          url: '#money',
        });
      });
  }
  if (prefs.expiry !== false) {
    cards.forEach(c => {
      if (!c.expiry || c.status === 'trashed' || c.status === 'killed') return;
      const days = Math.round((new Date(c.expiry + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
      if (![30, 7, 1, 0].includes(days)) return;
      out.push({
        tag: `expiry-${c.id}-${c.expiry}-${days}`,
        title: `${c.title || 'Document'} ${days === 0 ? 'expires today' : days === 1 ? 'expires tomorrow' : `expires in ${days} days`}`,
        body: `On ${c.expiry.slice(8, 10)}-${c.expiry.slice(5, 7)}-${c.expiry.slice(0, 4)}. Renew or claim before then.`,
        url: '#notes',
      });
    });
  }
  if (prefs.salary) {
    const day = Math.max(1, settings.salaryDay || 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() === Math.min(day, last)) {
      out.push({ tag: `salary-${today}`, title: 'Salary day', body: 'Your month recap is ready, and the payday checklist takes two minutes.', url: '#money' });
    }
  }
  return out;
}

async function backgroundReminders() {
  const [cards, settingsRows] = await Promise.all([readAll('hisaab', 'cards'), readAll('hisaab', 'settings')]);
  const settings = settingsRows.find(s => s.key === 'settings');
  if (!settings || !settings.consentAt) return;
  const now = new Date(), day = iso(now);
  const cache = await caches.open(REMINDERS);
  const hit = await cache.match('./__reminders-sent');
  const sentRec = hit ? await hit.json().catch(() => null) : null;
  const sent = sentRec && sentRec.day === day ? sentRec.tags : [];
  const fresh = dueReminders(cards, settings, now).filter(r => !sent.includes(r.tag));
  for (const r of fresh) {
    await self.registration.showNotification(r.title, { body: r.body, tag: r.tag, icon: './icon.svg', badge: './icon.svg', data: { url: r.url } });
  }
  if (fresh.length) {
    await cache.put('./__reminders-sent', new Response(JSON.stringify({ day, tags: sent.concat(fresh.map(r => r.tag)) }), { headers: { 'content-type': 'application/json' } }));
  }
}

self.addEventListener('periodicsync', event => {
  if (event.tag === 'hisaab-reminders') event.waitUntil(backgroundReminders());
});

// Tapping a reminder opens Hisaab (or focuses it) on the right screen.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.url) || '#home';
  const target = new URL('./' + hash, self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) { await w.focus(); w.navigate ? await w.navigate(target) : null; return; }
    }
    await self.clients.openWindow(target);
  })());
});
