/**
 * Reparse the TeamDesk invoice CSV and aggregate units per design_family per
 * calendar month, both in total and broken out per product_type variant
 * (garden / house / garden-banner). Writes:
 *
 *   designs.monthly_sales              — family aggregate, all variants
 *   designs.monthly_sales_garden       — garden-only variant
 *   designs.monthly_sales_house        — house-only variant
 *   designs.monthly_sales_garden_banner — garden-banner-only variant
 *
 * All four columns share the same JSONB shape:
 *   [{ "m": "2024-01", "u": 12 }, { "m": "2024-02", "u": 8 }, ...]
 * Sorted ascending by month. Months with zero sales are omitted; the UI fills
 * gaps as 0 bars to keep the axis continuous.
 *
 * The per-variant columns power the dashboard's Type=house / Type=garden
 * filter so the in-range tile units reflect what variant actually sold,
 * not the family aggregate.
 *
 * Usage:
 *   npx tsx scripts/import-monthly-sales.ts               # default CSV
 *   npx tsx scripts/import-monthly-sales.ts ./data/foo.csv
 */
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse";
import { parseSku } from "../lib/sku-parser";
import { chunkedUpsert, getAdminClient } from "./_supabase-admin";

const DEFAULT_CSV =
  "C:/Users/gbcab/ClownAntics Dropbox/Blake Cabot/Docs/Internet Business/200904 Clown/202604 AF Research App/Invoice Line Items_AF Image Review Export.csv";

// Same channel filter as import-teamdesk.ts — skip CA and FLAMZ CAN.
const SKIPPED_CHANNELS = new Set(["CA", "FLAMZ CAN"]);

interface MonthlyPoint {
  m: string; // 'YYYY-MM'
  u: number;
}

type Variant = "garden" | "house" | "garden-banner";

/** family → month → units */
type FamilyAgg = Map<string, Map<string, number>>;

function asPoints(months: Map<string, number>): MonthlyPoint[] {
  return [...months.entries()]
    .map(([m, u]) => ({ m, u }))
    .sort((a, b) => a.m.localeCompare(b.m));
}

async function main() {
  const csvPath = resolve(process.argv[2] || DEFAULT_CSV);
  console.log(`Reading: ${csvPath}\n`);

  const all: FamilyAgg = new Map();
  const garden: FamilyAgg = new Map();
  const house: FamilyAgg = new Map();
  const banner: FamilyAgg = new Map();
  const variantBuckets: Record<Variant, FamilyAgg> = {
    garden,
    house,
    "garden-banner": banner,
  };

  let rows = 0;
  let skippedUnknownVariant = 0;

  const parser = createReadStream(csvPath).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  );

  const bump = (agg: FamilyAgg, family: string, month: string, qty: number) => {
    let months = agg.get(family);
    if (!months) {
      months = new Map<string, number>();
      agg.set(family, months);
    }
    months.set(month, (months.get(month) || 0) + qty);
  };

  for await (const r of parser as AsyncIterable<Record<string, string>>) {
    rows++;
    const rawSku = r["SKU"];
    const orderDate = r["Order Number - Date"];
    const source = (r["Order Number - OrderSourceCalc"] || "").trim();
    const qty = Number(r["Quantity"] || "0");

    if (!orderDate || qty <= 0) continue;
    if (SKIPPED_CHANNELS.has(source)) continue;

    const parsed = parseSku(rawSku);
    if (!parsed) continue;

    const month = orderDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;

    bump(all, parsed.designFamily, month, qty);

    if (parsed.productType !== "unknown") {
      bump(variantBuckets[parsed.productType], parsed.designFamily, month, qty);
    } else {
      skippedUnknownVariant += qty;
    }

    if (rows % 10000 === 0) process.stdout.write(`  parsed ${rows} rows…\r`);
  }
  process.stdout.write(`  parsed ${rows} rows\n\n`);

  console.log(`Designs touched (any variant): ${all.size}`);
  console.log(`  garden:        ${garden.size}`);
  console.log(`  house:         ${house.size}`);
  console.log(`  garden-banner: ${banner.size}`);
  if (skippedUnknownVariant > 0) {
    console.log(
      `  unknown-variant units (counted in family total only): ${skippedUnknownVariant}`,
    );
  }
  console.log("");

  const updates: Array<{
    design_family: string;
    monthly_sales: MonthlyPoint[];
    monthly_sales_garden: MonthlyPoint[] | null;
    monthly_sales_house: MonthlyPoint[] | null;
    monthly_sales_garden_banner: MonthlyPoint[] | null;
  }> = [];

  for (const [family, months] of all.entries()) {
    const g = garden.get(family);
    const h = house.get(family);
    const b = banner.get(family);
    updates.push({
      design_family: family,
      monthly_sales: asPoints(months),
      monthly_sales_garden: g ? asPoints(g) : null,
      monthly_sales_house: h ? asPoints(h) : null,
      monthly_sales_garden_banner: b ? asPoints(b) : null,
    });
  }

  console.log(`Built monthly series for ${updates.length} designs.`);
  const sample = updates.slice(0, 3).map((u) => ({
    df: u.design_family,
    all: u.monthly_sales.length,
    garden: u.monthly_sales_garden?.length ?? 0,
    house: u.monthly_sales_house?.length ?? 0,
  }));
  console.log(`Example (first 3): ${JSON.stringify(sample)}\n`);

  const client = getAdminClient();
  console.log(`Upserting monthly_sales (+ variants) on ${updates.length} designs…`);
  await chunkedUpsert("designs", updates, client, "design_family");
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
