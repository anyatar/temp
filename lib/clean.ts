// Deterministic cleaning of the raw deals CSV. No LLM. Every change is logged; every rejected row is kept in the report.
import {
  CONDITIONS, FALSE_WORDS, PROPERTY_TYPES, SOURCES, TRUE_WORDS, canonicalCity,
} from "./aliases.ts";

export const THRESHOLDS = {
  minPrice: 100_000,
  minSizeSqm: 15,
  maxSizeSqm: 1000,
  flagRatio: 3, // price/m² this many times off the city median: flagged, excluded from stats
  quarantineRatio: 10, // ...this many times off: almost certainly a typo
  minCityDeals: 10, // cities with fewer priced deals compare against the national median
  newBuildMaxAge: 5, // "new from contractor" sold more than this many years after construction is contradictory
};

export type Flag = { field: string; reason: string; value?: unknown };

export type Deal = {
  id: string;
  city: string;
  neighborhood: string | null;
  street: string;
  propertyType: string;
  rooms: number;
  sizeSqm: number | null;
  floor: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  condition: string | null;
  hasElevator: boolean | null;
  hasParking: boolean | null;
  hasBalcony: boolean | null;
  hasSafeRoom: boolean | null;
  date: string; // YYYY-MM-DD, or YYYY-MM when the source gave only a month
  dateApprox: boolean;
  price: number;
  pricePerSqm: number | null;
  source: string;
  flags: Flag[];
  excludeFromStats: boolean;
  conflictingPrices?: number[];
};

type Change = { id: string; field: string; from: string; to: unknown; rule: string };
type Quarantined = { id: string; reason: string; row: unknown };

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export function parseDate(s: string): { date: string; approx: boolean } | null {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/))) [d, mo, y] = [+m[1], +m[2], +m[3]]; // day-first: Israeli convention
  else if ((m = s.match(/^([A-Za-z]{3}) (\d{4})$/))) {
    const i = MONTHS.indexOf(m[1].toLowerCase());
    return i < 0 ? null : { date: `${m[2]}-${pad(i + 1)}`, approx: true };
  } else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // rejects 31/02, 13th month
  return { date: `${y}-${pad(mo)}-${pad(d)}`, approx: false };
}

// "" → null (unknown); unparseable → NaN
const num = (s: string) => (s === "" ? null : Number(s.replace(/[₪,]/g, "")));

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function normalizeRow(
  raw: Record<string, string>,
  today: string,
  fix: (field: string, from: string, to: unknown, rule: string) => void,
): Deal | string {
  const t: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const s = v.trim().replace(/\s+/g, " ");
    if (s !== v) fix(k, v, s, "whitespace");
    t[k] = s;
  }
  const flags: Flag[] = [];

  const city = canonicalCity(t.city);
  if (!city) return "unknown-city";
  if (city !== t.city) fix("city", t.city, city, "city-alias");

  if (!PROPERTY_TYPES.includes(t.property_type)) return "unknown-property-type";
  if (!SOURCES.includes(t.source)) return "unknown-source";

  const roomsStr = t.rooms.replace(/\s*חדרים$/, "");
  if (roomsStr !== t.rooms) fix("rooms", t.rooms, roomsStr, "rooms-suffix");
  const rooms = Number(roomsStr);
  if (!(rooms >= 1 && rooms <= 12 && Number.isInteger(rooms * 2))) return "invalid-rooms";

  const price = num(t.price_nis);
  if (price === null || Number.isNaN(price)) return "missing-price";
  if (String(price) !== t.price_nis) fix("price_nis", t.price_nis, price, "number-format");
  if (price < THRESHOLDS.minPrice) return "price-below-floor";

  const sizeSqm = num(t.size_sqm);
  if (Number.isNaN(sizeSqm)) return "invalid-size";
  if (sizeSqm !== null && (sizeSqm < THRESHOLDS.minSizeSqm || sizeSqm > THRESHOLDS.maxSizeSqm)) return "size-out-of-range";

  const parsed = parseDate(t.deal_date);
  if (!parsed) return "invalid-date";
  if (parsed.date > today) return "future-date";
  if (parsed.date !== t.deal_date) fix("deal_date", t.deal_date, parsed.date, parsed.approx ? "date-month-only" : "date-format");

  // Optional fields: an invalid value becomes unknown (null) with a flag, never a guess.
  const optInt = (field: string, min: number, max: number) => {
    const v = num(t[field]);
    if (v === null) return null;
    if (Number.isInteger(v) && v >= min && v <= max) return v;
    flags.push({ field, reason: "invalid-value", value: t[field] });
    return null;
  };
  const floor = optInt("floor", 0, 100);
  const totalFloors = optInt("total_floors", 1, 100);
  const yearBuilt = optInt("year_built", 1850, +today.slice(0, 4));
  if (floor !== null && totalFloors !== null && floor > totalFloors) flags.push({ field: "floor", reason: "above-total-floors" });

  const optEnum = (field: string, allowed: string[]) => {
    if (t[field] === "") return null;
    if (allowed.includes(t[field])) return t[field];
    flags.push({ field, reason: "invalid-value", value: t[field] });
    return null;
  };
  const bool = (field: string) => {
    const v = t[field].toLowerCase();
    if (v === "") return null;
    if (TRUE_WORDS.includes(v)) return true;
    if (FALSE_WORDS.includes(v)) return false;
    flags.push({ field, reason: "invalid-value", value: t[field] });
    return null;
  };

  const pricePerSqm = sizeSqm ? Math.round(price / sizeSqm) : null;
  const csvPpsqm = num(t.price_per_sqm);
  if (pricePerSqm !== null && (csvPpsqm === null || Number.isNaN(csvPpsqm) || Math.abs(csvPpsqm - pricePerSqm) > pricePerSqm * 0.01))
    fix("price_per_sqm", t.price_per_sqm, pricePerSqm, "recomputed");

  return {
    id: t.deal_id,
    city,
    neighborhood: t.neighborhood || null,
    street: t.street,
    propertyType: t.property_type,
    rooms,
    sizeSqm,
    floor,
    totalFloors,
    yearBuilt,
    condition: optEnum("condition", CONDITIONS),
    hasElevator: bool("has_elevator"),
    hasParking: bool("has_parking"),
    hasBalcony: bool("has_balcony"),
    hasSafeRoom: bool("has_safe_room"),
    date: parsed.date,
    dateApprox: parsed.approx,
    price,
    pricePerSqm,
    source: t.source,
    flags,
    excludeFromStats: false,
  };
}

// Same deal_id reported more than once.
function dedupe(deals: Deal[], log: (c: Change) => void): Deal[] {
  const groups = Map.groupBy(deals, (d) => d.id);
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const { price: _p, pricePerSqm: _pp, source: _s, ...rest } = group[0];
    const sameExceptPrice = group.every((d) => {
      const { price: _p2, pricePerSqm: _pp2, source: _s2, ...r } = d;
      return JSON.stringify(r) === JSON.stringify(rest);
    });
    if (!sameExceptPrice) {
      log({ id: group[0].id, field: "*", from: `${group.length} copies`, to: "first kept", rule: "duplicate-id-mismatch" });
      return { ...group[0], excludeFromStats: true, flags: [...group[0].flags, { field: "*", reason: "duplicate-id-mismatch" }] };
    }
    const ranked = [...group].sort((a, b) => SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source));
    const best = ranked.filter((d) => d.source === ranked[0].source);
    const bestPrices = [...new Set(best.map((d) => d.price))];
    if (bestPrices.length > 1) {
      // Same source, different prices: nothing tells us which is right, so neither feeds a statistic.
      log({ id: best[0].id, field: "price", from: bestPrices.join(" / "), to: "both kept", rule: "same-source-price-conflict" });
      return {
        ...best[0],
        conflictingPrices: bestPrices,
        excludeFromStats: true,
        flags: [...best[0].flags, { field: "price", reason: "same-source-price-conflict", value: bestPrices }],
      };
    }
    for (const d of ranked.slice(1))
      log({
        id: d.id, field: "price", from: `${d.price} (${d.source})`, to: `${best[0].price} (${best[0].source})`,
        rule: d.price === best[0].price && d.source === best[0].source ? "duplicate-merged" : "source-precedence",
      });
    return best[0];
  });
}

function flagOutliers(deals: Deal[], quarantine: Quarantined[]): Deal[] {
  const ppsqm = (ds: Deal[]) => ds.filter((d) => d.pricePerSqm !== null && !d.excludeFromStats).map((d) => d.pricePerSqm!);
  const national = median(ppsqm(deals));
  const byCity = Map.groupBy(deals, (d) => d.city);
  return deals.filter((d) => {
    if (d.pricePerSqm === null) return true;
    const peers = ppsqm(byCity.get(d.city)!);
    const ref = peers.length >= THRESHOLDS.minCityDeals ? median(peers) : national;
    const ratio = Math.max(d.pricePerSqm / ref, ref / d.pricePerSqm);
    if (ratio >= THRESHOLDS.quarantineRatio) {
      quarantine.push({ id: d.id, reason: "price-per-sqm-far-from-median", row: d });
      return false;
    }
    if (ratio >= THRESHOLDS.flagRatio) {
      d.flags.push({ field: "price", reason: "price-per-sqm-off-median", value: Math.round(ratio * 10) / 10 });
      d.excludeFromStats = true;
    }
    return true;
  });
}

function flagContradictions(deals: Deal[]) {
  for (const d of deals) {
    const age = d.yearBuilt === null ? null : +d.date.slice(0, 4) - d.yearBuilt;
    if (d.condition === "חדש מקבלן" && age !== null && age > THRESHOLDS.newBuildMaxAge) {
      d.flags.push({ field: "condition", reason: "new-but-old-building", value: d.condition });
      d.condition = null; // field untrusted → unknown; the row still counts
    }
    if (d.propertyType === "דירת גן" && d.floor !== null && d.floor > 1)
      d.flags.push({ field: "propertyType", reason: "garden-apartment-above-ground", value: d.floor });
  }
}

// Same flat, same day, different deal_id. Reported only: they may be legitimately separate units.
function possibleDuplicates(deals: Deal[]) {
  const groups = Map.groupBy(deals, (d) => [d.city, d.street, d.rooms, d.sizeSqm, d.date].join("|"));
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.map((d) => d.id));
}

export function clean(csvText: string, today: string) {
  const [header, ...body] = parseCsv(csvText);
  const changes: Change[] = [];
  const quarantine: Quarantined[] = [];
  const normalized: Deal[] = [];

  for (const cells of body) {
    const raw = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
    if (cells.length !== header.length) {
      quarantine.push({ id: raw.deal_id ?? "?", reason: "wrong-field-count", row: cells });
      continue;
    }
    const id = raw.deal_id.trim();
    const result = normalizeRow(raw, today, (field, from, to, rule) => changes.push({ id, field, from, to, rule }));
    if (typeof result === "string") quarantine.push({ id, reason: result, row: raw });
    else normalized.push(result);
  }

  const deals = flagOutliers(dedupe(normalized, (c) => changes.push(c)), quarantine);
  flagContradictions(deals);

  const countBy = <T>(xs: T[], key: (x: T) => string) =>
    Object.fromEntries([...Map.groupBy(xs, key)].map(([k, v]) => [k, v.length]));

  return {
    deals,
    report: {
      thresholds: THRESHOLDS,
      counts: {
        rowsIn: body.length,
        dealsOut: deals.length,
        quarantined: quarantine.length,
        excludedFromStats: deals.filter((d) => d.excludeFromStats).length,
        changesByRule: countBy(changes, (c) => c.rule),
        quarantineByReason: countBy(quarantine, (q) => q.reason),
        flagsByReason: countBy(deals.flatMap((d) => d.flags), (f) => f.reason),
      },
      quarantine,
      flagged: deals.filter((d) => d.flags.length).map((d) => ({ id: d.id, excludeFromStats: d.excludeFromStats, flags: d.flags })),
      possibleDuplicates: possibleDuplicates(deals),
      changes,
    },
  };
}
