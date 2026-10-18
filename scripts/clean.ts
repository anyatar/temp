import { readFileSync, writeFileSync } from "node:fs";
import { clean } from "../lib/clean.ts";

const path = (p: string) => new URL(`../data/${p}`, import.meta.url);
// The date only decides what counts as a future deal date.
const today = new Date().toISOString().slice(0, 10);

const { deals, report } = clean(readFileSync(path("deals.csv"), "utf8"), today);
writeFileSync(path("deals.json"), JSON.stringify(deals));
writeFileSync(path("quality.json"), JSON.stringify(report, null, 2));
console.log(report.counts);
