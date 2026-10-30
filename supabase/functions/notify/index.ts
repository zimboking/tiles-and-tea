// Sends a phone notification to whoever's turn it is.
// POST { gameId, kind: "turn" | "nudge" }
//   turn:  right after a move (only within a couple of minutes of it).
//   nudge: a reminder from the waiting player, at most once an hour.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const NUDGE_GAP_MS = 60 * 60 * 1000;
const TURN_WINDOW_MS = 2 * 60 * 1000;
const GAME_ID = /^[a-z0-9]{6,20}$/;
const GONE = new Set([404, 410]);

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
};

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://zimboking.github.io/tiles-and-tea/';
webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type LogEntry = { type: string; seat?: number; words?: string[]; score?: number; count?: number };
type GameState = { turn: 1 | 2; over: boolean; names: Record<string, string>; log: LogEntry[] };

function message(state: GameState, kind: string) {
  const waiting = state.turn === 1 ? 2 : 1;
  const name = state.names[String(waiting)] || 'The other player';
  if (kind === 'nudge') return { title: `${name} is waiting for you`, body: "It's your turn in Tiles & Tea." };
  const last = state.log[state.log.length - 1];
  let body = `${name} has played.`;
  if (last?.type === 'play') body = `${name} played ${last.words?.join(', ')} for ${last.score}.`;
  if (last?.type === 'pass') body = `${name} passed.`;
  if (last?.type === 'exchange') body = `${name} swapped ${last.count} tiles.`;
  return { title: 'Your turn!', body };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  let input: { gameId?: unknown; kind?: unknown };
  try { input = await req.json(); } catch { return reply(400, { error: 'Send JSON.' }); }
  const { gameId, kind } = input ?? {};
  if (typeof gameId !== 'string' || !GAME_ID.test(gameId) || (kind !== 'turn' && kind !== 'nudge')) {
    return reply(400, { error: 'Bad request.' });
  }

  const { data: game, error } = await db.from('games')
    .select('state, updated_at, last_nudged_at').eq('id', gameId).maybeSingle();
  if (error) { console.error('load game', error); return reply(500, { error: 'Could not load the game.' }); }
  if (!game || game.state.over) return reply(404, { error: 'Game not found or finished.' });

  const now = Date.now();
  const state = game.state as GameState;
  const lastMoveAt = Date.parse(game.updated_at);

  if (kind === 'turn' && now - lastMoveAt > TURN_WINDOW_MS) return reply(409, { error: 'No recent move.' });
  if (kind === 'nudge') {
    const since = Math.max(lastMoveAt, game.last_nudged_at ? Date.parse(game.last_nudged_at) : 0);
    if (now - since < NUDGE_GAP_MS) {
      return reply(429, { error: 'Too soon to nudge.', retryAt: new Date(since + NUDGE_GAP_MS).toISOString() });
    }
    await db.from('games').update({ last_nudged_at: new Date(now).toISOString() }).eq('id', gameId);
  }

  const { data: subs, error: subsError } = await db.from('push_subscriptions')
    .select('endpoint, subscription').eq('game_id', gameId).eq('seat', state.turn);
  if (subsError) { console.error('load subscriptions', subsError); return reply(500, { error: 'Could not load devices.' }); }

  const payload = JSON.stringify({
    ...message(state, kind),
    tag: `tiles-and-tea-${gameId}`,
    url: `${SITE_URL}?g=${gameId}&p=${state.turn}`,
  });

  let sent = 0;
  await Promise.all((subs ?? []).map(async (sub) => {
    try {
      await webpush.sendNotification(sub.subscription, payload);
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 0;
      if (GONE.has(status)) {
        await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).eq('game_id', gameId);
      } else {
        console.error('push failed', status, (err as Error).message);
      }
    }
  }));

  return reply(200, { sent, devices: subs?.length ?? 0 });
});
