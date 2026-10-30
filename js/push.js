// Phone notifications: subscribe this device to a game seat, and ask the server to notify.

const ENABLED_KEY = (gameId, seat) => `tiles-and-tea:push:${gameId}:${seat}`;

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

export const isHomeScreenApp = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function pushEnabledHere(gameId, seat) {
  try {
    return Notification.permission === 'granted' && localStorage.getItem(ENABLED_KEY(gameId, seat)) === '1';
  } catch {
    return false;
  }
}

function keyBytes(base64Url) {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
}

export function registerWorker() {
  return pushSupported() ? navigator.serviceWorker.register('sw.js') : Promise.resolve(null);
}

// Must run from a button tap: iPhones only ask for permission after one.
export async function enablePush(client, gameId, seat, vapidPublicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your phone settings for this site.');

  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription())
    || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) });

  const { error } = await client.from('push_subscriptions').insert({
    endpoint: subscription.endpoint,
    game_id: gameId,
    seat,
    subscription: subscription.toJSON(),
  });
  const alreadySaved = error?.code === '23505';
  if (error && !alreadySaved) throw new Error(error.message);
  try { localStorage.setItem(ENABLED_KEY(gameId, seat), '1'); } catch { /* the button just shows again */ }
}

// kind: 'turn' after a move, or 'nudge'. Resolves { ok, retryAt? }.
export async function notify(client, gameId, kind) {
  const { data, error } = await client.functions.invoke('notify', { body: { gameId, kind } });
  if (!error) return { ok: true, sent: data?.sent ?? 0 };
  const details = await error.context?.json?.().catch(() => null);
  return { ok: false, retryAt: details?.retryAt ?? null, error: details?.error ?? error.message };
}
