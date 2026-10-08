// Tiny document store. The whole state lives in memory in this one process
// (the source of truth for live updates and timers) and is persisted after
// every change: to Postgres when DATABASE_URL is set, otherwise to a JSON file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const DATA_FILE = path.resolve(process.env.DATA_FILE || 'data/db.json');
const DATABASE_URL = process.env.DATABASE_URL;

const EMPTY = () => ({
  users: [],
  guardians: [],
  invites: [],
  stepups: [],
  recoveries: [],
  events: [],
});

let cache = null;

/** Shared Postgres pool (also used for sessions), or null in file mode. */
export const pool = DATABASE_URL
  ? new pg.Pool({
    connectionString: DATABASE_URL,
    // Render's internal URL needs no TLS; external URLs (local testing) do.
    ssl: /\.render\.com|sslmode=require/.test(DATABASE_URL) ? { rejectUnauthorized: false } : false,
    max: 5,
  })
  : null;

/** Loads state once at startup. Must be awaited before serving requests. */
export async function init() {
  if (!pool) {
    try {
      cache = { ...EMPTY(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
    } catch {
      cache = EMPTY();
    }
    return;
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS app_state (
    id int PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await pool.query('SELECT data FROM app_state WHERE id = 1');
  cache = { ...EMPTY(), ...(rows[0]?.data || {}) };
  console.log(`Loaded state from Postgres (${cache.users.length} users, ${cache.guardians.length} guardians)`);
}

// Postgres writes are serialised and coalesced: at most one in flight, and
// the next one always carries the latest state.
let writing = null;
let dirty = false;

async function persistToPostgres() {
  if (writing) { dirty = true; return writing; }
  writing = (async () => {
    do {
      dirty = false;
      try {
        await pool.query(
          `INSERT INTO app_state (id, data, updated_at) VALUES (1, $1, now())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [JSON.stringify(cache)],
        );
      } catch (err) {
        console.error('Saving state to Postgres failed; will retry on next change:', err.message);
        dirty = false;
      }
    } while (dirty);
  })();
  try { await writing; } finally { writing = null; }
}

function save() {
  if (pool) {
    persistToPostgres();
    return;
  }
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

/** Waits for any pending Postgres write (used on shutdown). */
export async function flush() {
  while (writing) await writing;
}

function load() {
  if (!cache) throw new Error('db.init() was not awaited');
  return cache;
}

/** Read-only access to the current data. */
export function read() {
  return load();
}

/** Mutate the data inside `fn`, then persist. Returns whatever `fn` returns. */
export function write(fn) {
  const data = load();
  const result = fn(data);
  save();
  return result;
}

export function newId(prefix = '') {
  return prefix + crypto.randomBytes(9).toString('base64url');
}

export const findUser = (id) => load().users.find((u) => u.id === id);
export const findGuardian = (id) => load().guardians.find((g) => g.id === id);
export const findUserByName = (name) => {
  const key = String(name || '').trim().toLowerCase();
  return load().users.find((u) => u.name.toLowerCase() === key);
};
export const guardiansOf = (userId) => load().guardians.filter((g) => g.guards.includes(userId));
