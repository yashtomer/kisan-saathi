/**
 * Weather context from Open-Meteo (no API key, no signup).
 *
 * Fetched once when a session starts and folded into the system prompt, so the
 * agent reasons about the farmer's actual conditions instead of asking him to
 * describe the weather. Humidity after rain drives fungal disease, and rain in
 * the next day makes spraying advice wrong — both change the diagnosis.
 */

import { hasDevanagari, transliterate } from './transliterate';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Budget for the whole lookup. A slow API must never delay the greeting. */
const TIMEOUT_MS = 3000;

/**
 * Caches, because this lookup sits inside a live conversation.
 *
 * Measured cost without them: 621ms to geocode plus 645ms to fetch the
 * forecast, sequential because the forecast needs the coordinates. That is
 * roughly 40% of a tool-using turn spent re-deriving two things that barely
 * change — a village does not move, and rainfall does not shift minute to
 * minute.
 *
 * Process-local and unbounded-in-principle, but the key space is the set of
 * places farmers mention in a session, which is tiny.
 */
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000; // coordinates are effectively static
const WEATHER_TTL_MS = 10 * 60 * 1000; // fresh enough for spray advice

type Cached<T> = { value: T; expiresAt: number };

const geocodeCache = new Map<string, Cached<GeocodeResult | null>>();

/**
 * Coordinates for districts farmers actually call from, seeded so the first
 * lookup skips geocoding entirely — worth ~620ms of silence on the turn where
 * the farmer first names his place, which is the turn that matters most.
 *
 * Not a substitute for the geocoder: anywhere not listed still resolves
 * normally, just a beat slower.
 */
const SEEDED_DISTRICTS: Array<[string, number, number, string]> = [
  ['nashik', 19.997, 73.791, 'Maharashtra'],
  ['wardha', 20.745, 78.602, 'Maharashtra'],
  ['nagpur', 21.146, 79.088, 'Maharashtra'],
  ['pune', 18.52, 73.857, 'Maharashtra'],
  ['aurangabad', 19.877, 75.343, 'Maharashtra'],
  ['jalgaon', 21.007, 75.563, 'Maharashtra'],
  ['amravati', 20.932, 77.752, 'Maharashtra'],
  ['solapur', 17.659, 75.906, 'Maharashtra'],
  ['ludhiana', 30.9, 75.857, 'Punjab'],
  ['amritsar', 31.634, 74.872, 'Punjab'],
  ['bathinda', 30.211, 74.945, 'Punjab'],
  ['patiala', 30.34, 76.386, 'Punjab'],
  ['karnal', 29.686, 76.99, 'Haryana'],
  ['hisar', 29.153, 75.722, 'Haryana'],
  ['meerut', 28.984, 77.706, 'Uttar Pradesh'],
  ['kanpur', 26.449, 80.331, 'Uttar Pradesh'],
  ['varanasi', 25.317, 82.973, 'Uttar Pradesh'],
  ['lucknow', 26.847, 80.947, 'Uttar Pradesh'],
  ['indore', 22.72, 75.858, 'Madhya Pradesh'],
  ['bhopal', 23.26, 77.413, 'Madhya Pradesh'],
  ['jabalpur', 23.181, 79.987, 'Madhya Pradesh'],
  ['raipur', 21.251, 81.629, 'Chhattisgarh'],
  ['jaipur', 26.912, 75.787, 'Rajasthan'],
  ['kota', 25.18, 75.839, 'Rajasthan'],
  ['patna', 25.594, 85.138, 'Bihar'],
  ['guntur', 16.306, 80.437, 'Andhra Pradesh'],
  ['belgaum', 15.852, 74.498, 'Karnataka'],
  ['coimbatore', 11.017, 76.956, 'Tamil Nadu'],
  ['rajkot', 22.303, 70.802, 'Gujarat'],
  ['ahmedabad', 23.023, 72.571, 'Gujarat'],
];

for (const [name, latitude, longitude, admin1] of SEEDED_DISTRICTS) {
  geocodeCache.set(name, {
    value: {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      latitude,
      longitude,
      admin1,
    },
    // Far enough out that a long-running process never re-geocodes these.
    expiresAt: Number.MAX_SAFE_INTEGER,
  });
}
const weatherCache = new Map<string, Cached<string | null>>();

function readCache<T>(cache: Map<string, Cached<T>>, key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

const writeCache = <T,>(
  cache: Map<string, Cached<T>>,
  key: string,
  value: T,
  ttl: number,
) => cache.set(key, { value, expiresAt: Date.now() + ttl });

type GeocodeResult = {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  population?: number;
};

type Forecast = {
  current?: { temperature_2m?: number; relative_humidity_2m?: number };
  daily?: { time?: string[]; precipitation_sum?: number[] };
};

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return (await response.json()) as T;
}

/** Resolves a spoken place name to coordinates, biased to India. */
async function geocode(
  place: string,
  signal: AbortSignal,
): Promise<GeocodeResult | null> {
  const cacheKey = place.toLowerCase().trim();
  const cached = readCache(geocodeCache, cacheKey);
  if (cached !== undefined) return cached;

  const url = `${GEOCODE_URL}?name=${encodeURIComponent(place)}&count=10&language=en&format=json&countryCode=IN`;
  const data = await getJson<{ results?: GeocodeResult[] }>(url, signal);
  const results = data.results ?? [];

  if (results.length === 0) {
    // Cache the miss too: a place we cannot resolve will not start resolving
    // later in the same call, and re-asking costs another 600ms of silence.
    writeCache(geocodeCache, cacheKey, null, GEOCODE_TTL_MS);
    return null;
  }

  // Approximate romanisation matches many small places. When a farmer names a
  // district, he means the district town — so prefer the most populous match
  // rather than whichever the index happened to return first.
  const best = results.reduce((winner, candidate) =>
    (candidate.population ?? 0) > (winner.population ?? 0) ? candidate : winner,
  );

  writeCache(geocodeCache, cacheKey, best, GEOCODE_TTL_MS);
  return best;
}

const sum = (values: number[]) =>
  Math.round(values.reduce((total, value) => total + value, 0) * 10) / 10;

/**
 * Returns a short plain-language weather brief, or null when the place cannot
 * be resolved or the API is unreachable. Callers treat null as "no weather
 * context" and carry on — this is enrichment, never a prerequisite.
 */
export async function fetchWeatherContext(
  place: string,
): Promise<string | null> {
  if (!place.trim()) return null;

  const cacheKey = place.toLowerCase().trim();
  const cachedSummary = readCache(weatherCache, cacheKey);
  if (cachedSummary !== undefined) return cachedSummary;

  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);

    // The agent passes the place name exactly as the farmer said it, which is
    // often Devanagari. The geocoder only indexes Latin spellings, so romanise
    // and retry rather than telling the farmer we cannot find his own village.
    let location = await geocode(place, signal);
    let approximate = false;

    if (!location && hasDevanagari(place)) {
      // Fallback only. Mechanical romanisation rarely matches conventional
      // spellings ("nagapur" is not Nagpur), so any hit here is flagged as
      // approximate rather than passed off as the farmer's actual district.
      location = await geocode(transliterate(place), signal);
      approximate = location !== null;
    }
    if (!location) return null;

    const url =
      `${FORECAST_URL}?latitude=${location.latitude}&longitude=${location.longitude}` +
      `&current=temperature_2m,relative_humidity_2m` +
      `&daily=precipitation_sum&past_days=3&forecast_days=3&timezone=auto`;
    const forecast = await getJson<Forecast>(url, signal);

    const rain = forecast.daily?.precipitation_sum ?? [];
    // past_days=3 puts three historical days first, then today and two ahead.
    const recentRain = sum(rain.slice(0, 3));
    const comingRain = sum(rain.slice(3));

    const where = [location.name, location.admin1].filter(Boolean).join(', ');
    const temperature = forecast.current?.temperature_2m;
    const humidity = forecast.current?.relative_humidity_2m;

    const readings = [
      temperature !== undefined && `temperature ${temperature} degrees Celsius`,
      humidity !== undefined && `humidity ${humidity} percent`,
      `rainfall over the last three days ${recentRain} mm`,
      `rainfall expected over the next three days ${comingRain} mm`,
    ].filter(Boolean);

    const summary = `Weather at ${where} right now: ${readings.join(', ')}.`;

    const result = approximate
      ? `${summary} NOTE: "${place}" could not be matched exactly, so this is the nearest place found. Check the location name with the farmer before relying on it.`
      : summary;

    writeCache(weatherCache, cacheKey, result, WEATHER_TTL_MS);
    return result;
  } catch {
    // Network failure, timeout, or an unparseable response: the conversation
    // is more important than the enrichment.
    return null;
  }
}
