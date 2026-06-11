/**
 * Overlay sales data onto `designs` + populate `sku_variants`, sourcing
 * **live** from Supabase (`td_invoice_line_item` joined to `td_order`)
 * instead of the static invoice CSV.
 *
 * Per design family this sets: units_total, the per-channel units_* columns,
 * first_sale_date, last_sale_date. Inserts rows for house/banner-only
 * designs that aren't in the AFGF/AFHF catalog. Populates `sku_variants`
 * (one row per distinct SKU that ever sold).
 *
 * Channel filter — FL-company channels only, same rule as
 * import-monthly-sales.ts. Rows with flagValidSale=false are skipped.
 * Sales window: orders dated >= 2023-01-01 (preserves the "since 2023"
 * semantics the dashboard was built around).
 *
 * Catalog-derived fields (design_name, image_url, product_types) are NOT
 * blindly overwritten: existing values win, and sales-derived product types
 * are merged in. Names for non-catalog families are looked up from
 * td_product as a fallback.
 *
 * Usage:
 *   npx tsx scripts/import-teamdesk.ts
 */
import { parseSku } from "../lib/sku-parser";
import { chunkedUpsert, getAdminClient } from "./_supabase-admin";

const PAGE_SIZE = 1000;
const SALES_WINDOW_START = "2023-01-01";

type UnitsKey = "fl" | "jf" | "flamz" | "fl_fba" | "fl_walmart" | "af_etsy";

// OrderSourceCalc → designs.units_* column. Anything not listed (all
// CA-company channels: CA, FP, AMZ*, FBA, CA Walmart, SHOW, WLS, plus
// FLAMZ CAN and international Amazon) is skipped and logged.
const CHANNEL_MAP: Record<string, UnitsKey> = {
  FL: "fl",
  JF: "jf",
  FLAMZ: "flamz",
  "FL FBA": "fl_fba",
  "FL WFS": "fl_walmart",
  "FL Walmart": "fl_walmart",
  "AF Etsy": "af_etsy",
  "JF Etsy": "af_etsy", // merged per spec
};

const IMAGE_URL_BASE = "https://images.clownantics.com/CA_resize_500_500/";

interface DesignAggregate {
  designFamily: string;
  themeCode: string;
  skuNumber: number;
  productTypes: Set<string>;
  baseSku: string; // shortest SKU seen, for fallback image URL
  firstSale: string;
  lastSale: string;
  units: Record<UnitsKey, number>;
}

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
  const client = getAdminClient();

  // --- 1. Order headers → index by OrderNumber ----------------------------
  console.log("Reading td_order…");
  const orders = await fetchAll<OrderRow>(
    () =>
      client
        .from("td_order")
        .select("OrderNumber,OrderSourceCalc,Date,flagValidSale")
        .order("OrderNumber") as unknown as {
        range: (f: number, t: number) => Promise<{ data: OrderRow[] | null; error: { message: string } | null }>;
      },
    "td_order",
  );
  const orderIndex = new Map<string, OrderRow>();
  for (const o of orders) if (o.OrderNumber) orderIndex.set(o.OrderNumber, o);
  console.log(`Indexed ${orderIndex.size} orders.\n`);

  // --- 2. AF line items ----------------------------------------------------
  console.log("Reading td_invoice_line_item (SKU ilike 'AF%')…");
  const lineItems = await fetchAll<LineItemRow>(
    () =>
      client
        .from("td_invoice_line_item")
        .select('SKU,Quantity,"Order Number"')
        .ilike("SKU", "AF%")
        .order("id") as unknown as {
        range: (f: number, t: number) => Promise<{ data: LineItemRow[] | null; error: { message: string } | null }>;
      },
    "td_invoice_line_item",
  );
  console.log("");

  // --- 3. Aggregate --------------------------------------------------------
  const designs = new Map<string, DesignAggregate>();
  const skuVariants = new Map<string, { sku: string; design_family: string; variant_type: string; product_type: string }>();
  const skippedChannels = new Map<string, number>();
  let counted = 0;
  let skippedNoParse = 0;
  let skippedInvalid = 0;
  let skippedNoOrder = 0;
  let skippedPreWindow = 0;
  let skippedNoQty = 0;

  for (const li of lineItems) {
    const qty = li.Quantity || 0;
    if (qty <= 0) {
      skippedNoQty++;
      continue;
    }
    const orderNum = li["Order Number"];
    const order = orderNum ? orderIndex.get(orderNum) : undefined;
    if (!order) {
      skippedNoOrder++;
      continue;
    }
    if (order.flagValidSale === false) {
      skippedInvalid++;
      continue;
    }
    const orderDate = order.Date;
    if (!orderDate || !/^\d{4}-\d{2}-\d{2}/.test(orderDate)) {
      skippedNoOrder++;
      continue;
    }
    if (orderDate < SALES_WINDOW_START) {
      skippedPreWindow++;
      continue;
    }
    const source = (order.OrderSourceCalc || "").trim();
    const channelCol = CHANNEL_MAP[source];
    if (!channelCol) {
      skippedChannels.set(source || "(blank)", (skippedChannels.get(source || "(blank)") || 0) + qty);
      continue;
    }
    const parsed = parseSku(li.SKU || "");
    if (!parsed) {
      skippedNoParse++;
      continue;
    }

    const skuKey = (li.SKU || "").trim().toUpperCase();
    if (!skuVariants.has(skuKey)) {
      skuVariants.set(skuKey, {
        sku: skuKey,
        design_family: parsed.designFamily,
        variant_type: parsed.variant,
        product_type: parsed.productType,
      });
    }

    let agg = designs.get(parsed.designFamily);
    if (!agg) {
      agg = {
        designFamily: parsed.designFamily,
        themeCode: parsed.themeCode,
        skuNumber: parsed.skuNumber,
        productTypes: new Set(),
        baseSku: skuKey,
        firstSale: orderDate,
        lastSale: orderDate,
        units: { fl: 0, jf: 0, flamz: 0, fl_fba: 0, fl_walmart: 0, af_etsy: 0 },
      };
      designs.set(parsed.designFamily, agg);
    }
    if (parsed.productType !== "unknown") agg.productTypes.add(parsed.productType);
    if (skuKey.length < agg.baseSku.length) agg.baseSku = skuKey;
    if (orderDate < agg.firstSale) agg.firstSale = orderDate;
    if (orderDate > agg.lastSale) agg.lastSale = orderDate;
    agg.units[channelCol] += qty;
    counted++;
  }

  console.log("=== Aggregation summary ===");
  console.log(`  line items counted:     ${counted}`);
  console.log(`  design families:        ${designs.size}`);
  console.log(`  unique SKUs:            ${skuVariants.size}`);
  console.log(`  skipped — bad SKU:      ${skippedNoParse}`);
  console.log(`  skipped — no order:     ${skippedNoOrder}`);
  console.log(`  skipped — invalid sale: ${skippedInvalid}`);
  console.log(`  skipped — pre-2023:     ${skippedPreWindow}`);
  console.log(`  skipped — qty <= 0:     ${skippedNoQty}`);
  if (skippedChannels.size > 0) {
    console.log("  skipped channels (units):");
    for (const [k, v] of [...skippedChannels.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(v).padStart(7)}  ${k}`);
    }
  }
  console.log("");

  // --- 4. Existing designs: don't clobber catalog-derived fields -----------
  console.log("Reading existing designs (to preserve catalog fields)…");
  const existing = new Map<string, { design_name: string | null; image_url: string | null; product_types: string[] | null }>();
  for (let off = 0; ; off += PAGE_SIZE) {
    const { data, error } = await client
      .from("designs")
      .select("design_family,design_name,image_url,product_types")
      .order("design_family")
      .range(off, off + PAGE_SIZE - 1);
    if (error) throw new Error(`designs read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const d of data as ({ design_family: string } & (typeof existing extends Map<string, infer V> ? V : never))[]) {
      existing.set(d.design_family, d);
    }
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`  ${existing.size} existing design rows\n`);

  // Fallback names for families not in the catalog import (banner-only,
  // inactive): look the description up in td_product across all AF SKUs.
  console.log("Reading td_product descriptions (name fallback)…");
  const productNames = new Map<string, string>();
  for (let off = 0; ; off += PAGE_SIZE) {
    const { data, error } = await client
      .from("td_product")
      .select("SKU,Description")
      .ilike("SKU", "AF%")
      .order("id")
      .range(off, off + PAGE_SIZE - 1);
    if (error) throw new Error(`td_product read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as { SKU: string | null; Description: string | null }[]) {
      const parsed = parseSku(r.SKU || "");
      if (!parsed || !r.Description) continue;
      if (!productNames.has(parsed.designFamily)) {
        productNames.set(parsed.designFamily, cleanName(r.Description));
      }
    }
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`  names for ${productNames.size} families\n`);

  // --- 5. Build payloads + upsert ------------------------------------------
  const designRows = Array.from(designs.values()).map((d) => {
    const prev = existing.get(d.designFamily);
    const mergedTypes = new Set<string>(prev?.product_types || []);
    for (const t of d.productTypes) mergedTypes.add(t);
    const totals =
      d.units.fl + d.units.jf + d.units.flamz + d.units.fl_fba + d.units.fl_walmart + d.units.af_etsy;
    return {
      design_family: d.designFamily,
      design_name: prev?.design_name || productNames.get(d.designFamily) || null,
      product_types: [...mergedTypes].sort(),
      theme_code: d.themeCode,
      sku_number: d.skuNumber,
      image_url: prev?.image_url || `${IMAGE_URL_BASE}${d.baseSku.toLowerCase()}.jpg`,
      first_sale_date: d.firstSale,
      last_sale_date: d.lastSale,
      units_total: totals,
      units_fl: d.units.fl,
      units_jf: d.units.jf,
      units_flamz: d.units.flamz,
      units_fl_fba: d.units.fl_fba,
      units_fl_walmart: d.units.fl_walmart,
      units_af_etsy: d.units.af_etsy,
    };
  });

  const variantRows = Array.from(skuVariants.values());

  console.log(`Upserting ${designRows.length} designs…`);
  await chunkedUpsert("designs", designRows, client, "design_family");
  console.log(`Upserting ${variantRows.length} sku_variants…`);
  await chunkedUpsert("sku_variants", variantRows, client, "sku");
  console.log(`\nDone. Run: npx tsx scripts/rebuild-product-types.ts && npx tsx scripts/classify.ts`);
}

function cleanName(raw: string): string {
  return raw
    .replace(/^America Forever\s+/i, "")
    .replace(/^(Garden|House)\s+(Flag|Banner)\s*[-–]\s*/i, "")
    .trim();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
