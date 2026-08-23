/** Server-only outside-temperature fetching (Open-Meteo, no API key). */
export async function fetchOpenMeteo(lat: number, lon: number, from: string, to: string) {
  const daily = "temperature_2m_min,temperature_2m_mean,temperature_2m_max";
  const qs = `latitude=${lat}&longitude=${lon}&start_date=${from}&end_date=${to}&daily=${daily}&timezone=Europe%2FLondon`;
  const urls = [
    `https://archive-api.open-meteo.com/v1/archive?${qs}`,
    `https://api.open-meteo.com/v1/forecast?${qs}`,
  ];
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const json = (await res.json()) as {
      daily?: {
        time?: string[];
        temperature_2m_min?: (number | null)[];
        temperature_2m_mean?: (number | null)[];
        temperature_2m_max?: (number | null)[];
      };
    };
    const time = json.daily?.time ?? [];
    const mean = json.daily?.temperature_2m_mean ?? [];
    if (time.length && mean.some((v) => v != null)) {
      return time.map((day, i) => ({
        day,
        temp_min: json.daily?.temperature_2m_min?.[i] ?? null,
        temp_mean: mean[i] ?? null,
        temp_max: json.daily?.temperature_2m_max?.[i] ?? null,
      }));
    }
  }
  return [];
}
