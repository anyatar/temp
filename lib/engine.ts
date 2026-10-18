// Answers a validated Query from the cleaned deals. Every number the user sees is computed here.
import type { Deal } from "./clean.ts";
import type { Filters, Query } from "./schema.ts";

export const MIN_N = 5; // below this many deals we show the deals, never a statistic
const MAX_DEALS = 50; // deals returned for display; n always reports the full count
const BUDGET_BAND = 0.8; // "what can I buy for X" looks at deals priced between 80% and 100% of X

type Range = { min?: number; max?: number };
type Metric = "price" | "pricePerSqm";

const inRange = (v: number | null, r?: Range) =>
  !r || (v !== null && (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max));
const anyOf = <T>(v: T, list?: T[]) => !list?.length || list.includes(v);
const is = (v: boolean | null, want?: boolean) => want === undefined || v === want;

export const matches = (d: Deal, f: Filters) =>
  anyOf(d.city, f.cities) &&
  anyOf(d.neighborhood ?? "", f.neighborhoods) &&
  anyOf(d.street, f.streets) &&
  anyOf(d.propertyType, f.propertyTypes) &&
  anyOf(d.condition ?? "", f.conditions) &&
  inRange(d.rooms, f.rooms) &&
  inRange(d.sizeSqm, f.sizeSqm) &&
  inRange(d.price, f.price) &&
  inRange(d.pricePerSqm, f.pricePerSqm) &&
  is(d.hasElevator, f.hasElevator) &&
  is(d.hasParking, f.hasParking) &&
  is(d.hasBalcony, f.hasBalcony) &&
  is(d.hasSafeRoom, f.hasSafeRoom) &&
  (!f.dateFrom || d.date >= f.dateFrom) &&
  (!f.dateTo || d.date.slice(0, f.dateTo.length) <= f.dateTo);

const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo);
};

export type Summary = { n: number; median: number; p25: number; p75: number; min: number; max: number };

export function summarize(values: number[]): Summary | null {
  if (values.length < MIN_N) return null;
  const s = [...values].sort((a, b) => a - b);
  const r = (x: number) => Math.round(x);
  return { n: s.length, median: r(quantile(s, 0.5)), p25: r(quantile(s, 0.25)), p75: r(quantile(s, 0.75)), min: s[0], max: s.at(-1)! };
}

const value = (d: Deal, m: Metric) => (m === "price" ? d.price : d.pricePerSqm);

// Deals that may feed a statistic: matching, not flagged out, and with the metric known.
function pool(deals: Deal[], f: Filters, m: Metric) {
  const matching = deals.filter((d) => matches(d, f));
  const usable = matching.filter((d) => !d.excludeFromStats && value(d, m) !== null);
  return { usable, excluded: matching.filter((d) => d.excludeFromStats).length };
}

// Too few deals: drop the most specific filters first, and say so.
const WIDENING: [string, (f: Filters) => Filters | null][] = [
  ["street", (f) => (f.streets ? { ...f, streets: undefined } : null)],
  ["neighborhood", (f) => (f.neighborhoods ? { ...f, neighborhoods: undefined } : null)],
  ["rooms", (f) => (f.rooms ? { ...f, rooms: { min: f.rooms.min && f.rooms.min - 0.5, max: f.rooms.max && f.rooms.max + 0.5 } } : null)],
];

function widenedPool(deals: Deal[], filters: Filters, m: Metric) {
  let f = filters;
  let p = pool(deals, f, m);
  const widened: string[] = [];
  for (const [name, step] of WIDENING) {
    if (p.usable.length >= MIN_N) break;
    const next = step(f);
    if (!next) continue;
    f = next;
    p = pool(deals, f, m);
    widened.push(name);
  }
  return { ...p, filters: f, widened };
}

const dateSpan = (ds: Deal[]): [string, string] | null =>
  ds.length ? [ds.reduce((a, d) => (d.date < a ? d.date : a), ds[0].date), ds.reduce((a, d) => (d.date > a ? d.date : a), ds[0].date)] : null;

const byDateDesc = (ds: Deal[]) => [...ds].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_DEALS);

function groupSummary(key: string, ds: Deal[], m: Metric) {
  return { key, n: ds.length, summary: summarize(ds.map((d) => value(d, m)!)) };
}

export function answer(q: Query, deals: Deal[]) {
  switch (q.type) {
    case "search": {
      const found = deals.filter((d) => matches(d, q.filters));
      return { ...q, n: found.length, dateSpan: dateSpan(found), deals: byDateDesc(found) };
    }
    case "stat": {
      const p = widenedPool(deals, q.filters, q.metric);
      return { ...q, filters: p.filters, widened: p.widened, n: p.usable.length, excluded: p.excluded,
        dateSpan: dateSpan(p.usable), summary: summarize(p.usable.map((d) => value(d, q.metric)!)), deals: byDateDesc(p.usable) };
    }
    case "priceCheck": {
      const metric: Metric = q.sizeSqm ? "pricePerSqm" : "price";
      const asked = q.sizeSqm ? Math.round(q.price / q.sizeSqm) : q.price;
      const p = widenedPool(deals, q.filters, metric);
      const values = p.usable.map((d) => value(d, metric)!);
      const summary = summarize(values);
      const percentile = summary && Math.round((100 * values.filter((v) => v < asked).length) / values.length);
      return { ...q, metric, asked, filters: p.filters, widened: p.widened, n: values.length, excluded: p.excluded,
        dateSpan: dateSpan(p.usable), summary, percentile, deals: byDateDesc(p.usable) };
    }
    case "budget": {
      const f = { ...q.filters, price: { min: Math.round(q.budget * BUDGET_BAND), max: q.budget } };
      const p = pool(deals, f, "price");
      const groups = [...Map.groupBy(p.usable, (d) => d.city)].map(([city, ds]) => ({
        key: city,
        n: ds.length,
        rooms: { min: Math.min(...ds.map((d) => d.rooms)), max: Math.max(...ds.map((d) => d.rooms)) },
        sizeSqm: summarize(ds.flatMap((d) => (d.sizeSqm === null ? [] : [d.sizeSqm]))),
      })).sort((a, b) => b.n - a.n);
      return { ...q, filters: f, n: p.usable.length, excluded: p.excluded, dateSpan: dateSpan(p.usable), groups, deals: byDateDesc(p.usable) };
    }
    case "ranking": {
      const p = pool(deals, q.filters, "pricePerSqm");
      const key = (d: Deal) => (q.groupBy === "city" ? d.city : `${d.neighborhood ?? "ללא שכונה"}, ${d.city}`);
      const all = [...Map.groupBy(p.usable, key)].map(([k, ds]) => groupSummary(k, ds, "pricePerSqm"));
      const ranked = all.filter((g) => g.summary).sort((a, b) => (a.summary!.median - b.summary!.median) * (q.order === "cheapest" ? 1 : -1));
      return { ...q, n: p.usable.length, excluded: p.excluded, dateSpan: dateSpan(p.usable), groups: ranked, tooFewDeals: all.length - ranked.length };
    }
    case "compare": {
      // No widening here: widening one side would make the two sides incomparable.
      const sides = q.groups.map((g) => {
        const f = { ...q.filters, ...g };
        const p = pool(deals, f, "pricePerSqm");
        return { filters: f, n: p.usable.length, excluded: p.excluded, dateSpan: dateSpan(p.usable), summary: summarize(p.usable.map((d) => d.pricePerSqm!)) };
      });
      return { ...q, sides };
    }
    case "trend": {
      const p = pool(deals, q.filters, "pricePerSqm");
      const last = dateSpan(deals)?.[1] ?? "";
      const years = [...Map.groupBy(p.usable, (d) => d.date.slice(0, 4))]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([year, ds]) => ({ ...groupSummary(year, ds, "pricePerSqm"), partial: last.startsWith(year) && !last.startsWith(`${year}-12`) }));
      return { ...q, n: p.usable.length, excluded: p.excluded, dateSpan: dateSpan(p.usable), years };
    }
    case "unsupported":
      return q;
  }
}

export type Answer = ReturnType<typeof answer>;
