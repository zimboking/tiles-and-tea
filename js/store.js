// Game storage. Online: a Supabase "games" table with realtime updates.
// Without Supabase settings it falls back to this browser only (handy for testing in two tabs).

const TABLE = 'games';
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ID_LENGTH = 10;

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

export function createStore(config) {
  const online = config.supabaseUrl && config.supabaseKey && window.supabase;
  return online ? supabaseStore(config) : localStore();
}

function supabaseStore({ supabaseUrl, supabaseKey }) {
  const client = window.supabase.createClient(supabaseUrl, supabaseKey);
  const check = (error) => { if (error) throw new Error(error.message); };

  return {
    online: true,
    client,
    async create(state) {
      const id = newId();
      const { error } = await client.from(TABLE).insert({ id, state, version: 1 });
      check(error);
      return id;
    },
    async load(id) {
      const { data, error } = await client.from(TABLE).select('state, version').eq('id', id).maybeSingle();
      check(error);
      return data;
    },
    // Saves only if nobody else saved first; returns { ok: false } on a clash.
    async save(id, state, version) {
      const { data, error } = await client.from(TABLE)
        .update({ state, version: version + 1, updated_at: new Date().toISOString() })
        .eq('id', id).eq('version', version).select('version');
      check(error);
      return data.length ? { ok: true, version: version + 1 } : { ok: false };
    },
    subscribe(id, onChange) {
      const channel = client.channel(`game-${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: TABLE, filter: `id=eq.${id}` },
          (payload) => onChange({ state: payload.new.state, version: payload.new.version }))
        .subscribe();
      return () => client.removeChannel(channel);
    },
  };
}

function localStore() {
  const key = (id) => `tiles-and-tea:${id}`;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('tiles-and-tea') : null;
  const read = (id) => {
    try { return JSON.parse(localStorage.getItem(key(id))); } catch { return null; }
  };
  const write = (id, record) => {
    localStorage.setItem(key(id), JSON.stringify(record));
    channel?.postMessage(id);
  };

  return {
    online: false,
    async create(state) {
      const id = newId();
      write(id, { state, version: 1 });
      return id;
    },
    async load(id) { return read(id); },
    async save(id, state, version) {
      const current = read(id);
      if (!current || current.version !== version) return { ok: false };
      write(id, { state, version: version + 1 });
      return { ok: true, version: version + 1 };
    },
    subscribe(id, onChange) {
      const handler = (event) => { if (event.data === id) { const r = read(id); if (r) onChange(r); } };
      channel?.addEventListener('message', handler);
      return () => channel?.removeEventListener('message', handler);
    },
  };
}
