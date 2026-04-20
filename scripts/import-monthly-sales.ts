/**
 * Reparse the TeamDesk invoice CSV and aggregate units per design_family per
 * calendar month. Writes the result to designs.monthly_sales as JSONB like:
 *
 *   [{ "m": "2024-01", "u": 12 }, { "m": "2024-02", "u": 8 }, ...]
 *
 * Sorted ascending by month. Months with zero sales are omitted — the UI fills
 * in gaps as 0 bars so the x-axis is continuous.
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

async function main() {
  const csvPath = resolve(process.argv[2] || DEFAULT_CSV);
  console.log(`Reading: ${csvPath}\n`);

  // designFamily -> month ('YYYY-MM') -> units
  const byDesign = new Map<string, Map<string, number>>();
  let rows = 0;

  const parser = createReadStream(csvPath).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  );

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

    // Extract 'YYYY-MM' from order date (already ISO-ish).
    const month = orderDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;

    let months = byDesign.get(parsed.designFamily);
    if (!months) {
      months = new Map<string, number>();
      byDesign.set(parsed.designFamily, months);
    }
    months.set(month, (months.get(month) || 0) + qty);

    if (rows % 10000 === 0) process.stdout.write(`  parsed ${rows} rows…\r`);
  }
  process.stdout.write(`  parsed ${rows} rows\n\n`);

  // Convert to the JSONB shape, sorted by month ascending.
  const updates: { design_family: string; monthly_sales: MonthlyPoint[] }[] = [];
  for (const [family, months] of byDesign.entries()) {
    const points: MonthlyPoint[] = Array.from(months.entries())
      .map(([m, u]) => ({ m, u }))
      .sort((a, b) => a.m.localeCompare(b.m));
    updates.push({ design_family: family, monthly_sales: points });
  }

  console.log(`Built monthly series for ${updates.length} designs.`);
  console.log(
    `Example (first 3): ${JSON.stringify(
      updates.slice(0, 3).map((u) => ({
        df: u.design_family,
        months: u.monthly_sales.length,
      })),
    )}\n`,
  );

  const client = getAdminClient();
  console.log(`Upserting monthly_sales on ${updates.length} designs…`);
  await chunkedUpsert("designs", updates, client, "design_family");
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
