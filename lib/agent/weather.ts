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
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(place)}&count=10&language=en&format=json&countryCode=IN`;
  const data = await getJson<{ results?: GeocodeResult[] }>(url, signal);
  const results = data.results ?? [];
  if (results.length === 0) return null;

  // Approximate romanisation matches many small places. When a farmer names a
  // district, he means the district town — so prefer the most populous match
  // rather than whichever the index happened to return first.
  return results.reduce((best, candidate) =>
    (candidate.population ?? 0) > (best.population ?? 0) ? candidate : best,
  );
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

    return approximate
      ? `${summary} NOTE: "${place}" could not be matched exactly, so this is the nearest place found. Check the location name with the farmer before relying on it.`
      : summary;
  } catch {
    // Network failure, timeout, or an unparseable response: the conversation
    // is more important than the enrichment.
    return null;
  }
}
