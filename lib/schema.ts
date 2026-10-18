// The single contract between question parsers (LLM and rules) and the engine.
import { z } from "zod";
import { CITIES, CONDITIONS, PROPERTY_TYPES } from "./aliases.ts";

const oneOf = (values: string[]) => z.enum(values as [string, ...string[]]);
const range = z.object({ min: z.number().optional(), max: z.number().optional() }).strict();
const yearMonth = z.string().regex(/^\d{4}(-\d{2})?$/);

export const Filters = z
  .object({
    cities: z.array(oneOf(CITIES)).optional(),
    neighborhoods: z.array(z.string()).optional(),
    streets: z.array(z.string()).optional(),
    propertyTypes: z.array(oneOf(PROPERTY_TYPES)).optional(),
    conditions: z.array(oneOf(CONDITIONS)).optional(),
    rooms: range.optional(),
    sizeSqm: range.optional(),
    price: range.optional(),
    pricePerSqm: range.optional(),
    hasElevator: z.boolean().optional(),
    hasParking: z.boolean().optional(),
    hasBalcony: z.boolean().optional(),
    hasSafeRoom: z.boolean().optional(),
    dateFrom: yearMonth.optional(),
    dateTo: yearMonth.optional(),
  })
  .strict();

export const Query = z.discriminatedUnion("type", [
  z.object({ type: z.literal("search"), filters: Filters }),
  z.object({ type: z.literal("stat"), filters: Filters, metric: z.enum(["price", "pricePerSqm"]) }),
  z.object({
    type: z.literal("priceCheck"),
    filters: Filters,
    price: z.number().positive(),
    sizeSqm: z.number().positive().optional(),
  }),
  z.object({ type: z.literal("budget"), filters: Filters, budget: z.number().positive() }),
  z.object({
    type: z.literal("ranking"),
    filters: Filters,
    groupBy: z.enum(["city", "neighborhood"]),
    order: z.enum(["cheapest", "mostExpensive"]),
  }),
  z.object({ type: z.literal("compare"), filters: Filters, groups: z.array(Filters).length(2) }),
  z.object({ type: z.literal("trend"), filters: Filters }),
  z.object({
    type: z.literal("unsupported"),
    reason: z.enum(["forecast", "advice", "notInData", "other"]),
    detail: z.string().optional(),
  }),
]);

export type Filters = z.infer<typeof Filters>;
export type Query = z.infer<typeof Query>;
