/**
 * Aggregate units per design_family per calendar month, sourcing **live** from
 * Supabase (`td_invoice_line_item` joined to `td_order`) instead of the static
 * invoice CSV. Writes four jsonb columns on `designs`:
 *
 *   designs.monthly_sales              — family aggregate, all variants
 *   designs.monthly_sales_garden       — garden-only variant
 *   designs.monthly_sales_house        — house-only variant
 *   designs.monthly_sales_garden_banner — garden-banner-only variant
 *
 * All four columns share the same JSONB shape:
 *   [{ "m": "2024-01", "u": 12 }, { "m": "2024-02", "u": 8 }, ...]
 * Sorted ascending by month. Months with zero sales are omitted.
 *
 * Channel filter — keep only FL-company channels (per the Channels reference
 * table). Anything CA-company is treated as separate-business sales and excluded.
 * `flagValidSale=false` rows (returns/cancellations) are excluded.
 *
 * Why Supabase and not the CSV: the live tables stay current as new invoices
 * land in TeamDesk; the CSV needs a manual re-export. A fresh re-export from
 * April 16 already missed several SKUs (AFMS0792, AFMS0793) which were present
 * in Supabase the whole time.
 *
 * Usage:
 *   npx tsx scripts/import-monthly-sales.ts
 */
import { parseSku } from "../lib/sku-parser";
import { chunkedUpsert, getAdminClient } from "./_supabase-admin";

const PAGE_SIZE = 1000;

/** OrderSourceCalc values to keep (FL-company channels). Everything else —
 *  CA, FP, AMZ, AMZ CAN, FBA, CA Walmart, SHOW, WLS, FLAMZ CAN — is dropped
 *  at parse time. JF Etsy is a JF-branded Etsy storefront, not in the formal
 *  channel reference but treated as FL-company per the old CSV mapping
 *  (units_af_etsy merged AF Etsy + JF Etsy). */
const KEPT_CHANNELS = new Set([
  "FL",
  "JF",
  "FLAMZ",
  "FL FBA",
  "FL WFS",
  "FL Walmart",
  "AF Etsy",
  "JF Etsy",
]);

interface MonthlyPoint {
  m: string;
  u: number;
}

type Variant = "garden" | "house" | "garden-banner";
type FamilyAgg = Map<string, Map<string, number>>;

interface OrderRow {
  OrderNumber: string;
  OrderSourceCalc: string | null;
  Date: string | null;
  flagValidSale: boolean | null;
}

interface LineItemRow {
  SKU: string | null;
  Quantity: number | null;
  "Order Number": string | null;
}

function asPoints(months: Map<string, number>): MonthlyPoint[] {
  return [...months.entries()]
    .map(([m, u]) => ({ m, u }))
    .sort((a, b) => a.m.localeCompare(b.m));
}

/** Fetch every row of a table (or a filtered slice) in PAGE_SIZE-row chunks. */
async function fetchAll<T>(
  build: () => {
    range: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>;
  },
  label: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await build().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${label} read failed at offset ${offset}: ${error.message}`);
    const rows = data || [];
    out.push(...rows);
    process.stdout.write(`  ${label}: ${out.length}\r`);
    if (rows.length < PAGE_SIZE) break;
  }
  process.stdout.write(`  ${label}: ${out.length}\n`);
  return out;
}

async function main() {
  const c = getAdminClient();

  // --- 1. Pull every order header into memory ----------------------------
  console.log("Reading td_order…");
  const orders = await fetchAll<OrderRow>(
    () =>
      c
        .from("td_order")
        .select("OrderNumber,OrderSourceCalc,Date,flagValidSale")
        .order("OrderNumber") as unknown as {
        range: (f: number, t: number) => Promise<{ data: OrderRow[] | null; error: { message: string } | null }>;
      },
    "td_order",
  );

  // Index by OrderNumber for O(1) lookup by line item.
  const orderIndex = new Map<string, OrderRow>();
  for (const o of orders) {
    if (o.OrderNumber) orderIndex.set(o.OrderNumber, o);
  }
  console.log(`Indexed ${orderIndex.size} orders.\n`);

  // --- 2. Pull every AF line item ----------------------------------------
  console.log("Reading td_invoice_line_item (SKU ilike 'AF%')…");
  const lineItems = await fetchAll<LineItemRow>(
    () =>
      c
        .from("td_invoice_line_item")
        .select('SKU,Quantity,"Order Number"')
        .ilike("SKU", "AF%")
        .order("id") as unknown as {
        range: (f: number, t: number) => Promise<{ data: LineItemRow[] | null; error: { message: string } | null }>;
      },
    "td_invoice_line_item",
  );
  console.log("");

  // --- 3. Aggregate -------------------------------------------------------
  const all: FamilyAgg = new Map();
  const garden: FamilyAgg = new Map();
  const house: FamilyAgg = new Map();
  const banner: FamilyAgg = new Map();
  const variantBuckets: Record<Variant, FamilyAgg> = {
    garden,
    house,
    "garden-banner": banner,
  };

  const bump = (agg: FamilyAgg, family: string, month: string, qty: number) => {
    let m = agg.get(family);
    if (!m) {
      m = new Map<string, number>();
      agg.set(family, m);
    }
    m.set(month, (m.get(month) || 0) + qty);
  };

  let skipNoOrder = 0;
  let skipChannel = 0;
  let skipInvalid = 0;
  let skipBadSku = 0;
  let skipNoDate = 0;
  let skipNoQty = 0;
  let skipUnknownVariant = 0;
  let counted = 0;
  const unknownChannels = new Map<string, number>();

  for (const li of lineItems) {
    const qty = li.Quantity || 0;
    if (qty <= 0) {
      skipNoQty++;
      continue;
    }
    const orderNum = li["Order Number"];
    if (!orderNum) {
      skipNoOrder++;
      continue;
    }
    const order = orderIndex.get(orderNum);
    if (!order) {
      skipNoOrder++;
      continue;
    }
    if (order.flagValidSale === false) {
      skipInvalid++;
      continue;
    }
    const source = (order.OrderSourceCalc || "").trim();
    if (!KEPT_CHANNELS.has(source)) {
      skipChannel++;
      if (source) unknownChannels.set(source, (unknownChannels.get(source) || 0) + qty);
      continue;
    }
    if (!order.Date) {
      skipNoDate++;
      continue;
    }
    const month = order.Date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      skipNoDate++;
      continue;
    }
    const parsed = parseSku(li.SKU || "");
    if (!parsed) {
      skipBadSku++;
      continue;
    }

    bump(all, parsed.designFamily, month, qty);
    if (parsed.productType !== "unknown") {
      bump(variantBuckets[parsed.productType], parsed.designFamily, month, qty);
    } else {
      skipUnknownVariant++;
    }
    counted++;
  }

  console.log("=== Aggregation summary ===");
  console.log(`  counted:            ${counted}`);
  console.log(`  skipped — no/missing order:   ${skipNoOrder}`);
  console.log(`  skipped — channel filter:     ${skipChannel}`);
  console.log(`  skipped — flagValidSale=false: ${skipInvalid}`);
  console.log(`  skipped — bad/non-AF SKU:     ${skipBadSku}`);
  console.log(`  skipped — no/bad Date:        ${skipNoDate}`);
  console.log(`  skipped — qty <= 0:           ${skipNoQty}`);
  console.log(`  unknown-variant units in family total: ${skipUnknownVariant}`);

  if (unknownChannels.size > 0) {
    console.log("\nChannels excluded (CA-company or unknown):");
    for (const [k, v] of [...unknownChannels.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(7)}  ${k}`);
    }
  }

  console.log(`\nDesigns touched: ${all.size}`);
  console.log(`  garden:        ${garden.size}`);
  console.log(`  house:         ${house.size}`);
  console.log(`  garden-banner: ${banner.size}\n`);

  // --- 4. Build upsert payload + write -----------------------------------
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

  console.log(`Upserting monthly_sales (+ variants) on ${updates.length} designs…`);
  await chunkedUpsert("designs", updates, c, "design_family");
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
