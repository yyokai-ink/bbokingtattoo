/** Several masters often share one address (a studio). One marker per location, with all its masters inside. Pure → unit-tested. */
export interface Located<T> { lat: number; lng: number; item: T }
export interface Group<T> { key: string; lat: number; lng: number; items: T[] }

export function groupByLocation<T>(rows: Located<T>[], decimals = 4): Group<T>[] {
  const map = new Map<string, Group<T>>();
  for (const r of rows) {
    const key = `${r.lat.toFixed(decimals)},${r.lng.toFixed(decimals)}`;
    const g = map.get(key);
    if (g) g.items.push(r.item);
    else map.set(key, { key, lat: r.lat, lng: r.lng, items: [r.item] });
  }
  return [...map.values()];
}
