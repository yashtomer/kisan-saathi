import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Storage for the case store.
 *
 * Local development writes a JSON file, which survives restarts and is easy to
 * inspect. Serverless hosts have a read-only filesystem, so when Redis
 * credentials are present (Upstash, or Vercel's KV integration, which sets the
 * same values under different names) the cases live there instead.
 *
 * Deliberately a single blob rather than per-case keys: the dashboard always
 * reads the whole queue, demo volumes are tiny, and one round trip beats N.
 */

const FILE_PATH = join(process.cwd(), '.data', 'cases.json');
const REDIS_KEY = 'kisan-saathi:cases';
const TIMEOUT_MS = 4000;

type RedisConfig = { url: string; token: string };

function redisConfig(): RedisConfig | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

/** True when cases persist somewhere that survives a serverless cold start. */
export const isDurable = () => redisConfig() !== null;

async function redisGet({ url, token }: RedisConfig): Promise<string | null> {
  const response = await fetch(`${url}/get/${REDIS_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`redis get failed: ${response.status}`);
  const body = (await response.json()) as { result?: string | null };
  return body.result ?? null;
}

async function redisSet(
  { url, token }: RedisConfig,
  value: string,
): Promise<void> {
  // POST body form avoids URL-length limits as the queue grows.
  const response = await fetch(`${url}/set/${REDIS_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: value,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`redis set failed: ${response.status}`);
}

export async function readRaw<T>(fallback: T): Promise<T> {
  const config = redisConfig();

  if (config) {
    try {
      const stored = await redisGet(config);
      return stored ? (JSON.parse(stored) as T) : fallback;
    } catch (error) {
      console.error('[cases] redis read failed:', error);
      return fallback;
    }
  }

  try {
    return JSON.parse(await readFile(FILE_PATH, 'utf8')) as T;
  } catch {
    // Missing or unreadable file simply means no cases yet.
    return fallback;
  }
}

export async function writeRaw(value: unknown): Promise<void> {
  const config = redisConfig();
  const serialised = JSON.stringify(value, null, 2);

  if (config) {
    await redisSet(config, serialised);
    return;
  }

  await mkdir(dirname(FILE_PATH), { recursive: true });
  await writeFile(FILE_PATH, serialised, 'utf8');
}
