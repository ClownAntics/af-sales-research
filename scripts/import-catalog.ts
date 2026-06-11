/**
 * Seed the `designs` table from the **live** product catalog in Supabase
 * (`td_product`) — no CSV needed.
 *
 * Run FIRST (before import-teamdesk.ts), so the table contains every active
 * AF design — even ones that never sold. Sales data overlays on top.
 *
 * Filter rules:
 *   - SKU starts with `AFGF` (garden) or `AFHF` (house) — banner-only designs
 *     still enter via the import-teamdesk sales overlay
 *   - Status = `Active` only (drop Inactive / Pending / CA Discontinued)
 *   - Unparseable SKUs (AFGFCUSTOM etc.) are dropped by parseSku
 *
 * Why Supabase and not the CSV: the TeamDesk "AF Image Review Export" view
 * lagged reality two ways — the exported file goes stale the moment someone
 * adds designs, and the view itself omits some products entirely (e.g. the
 * Jan-2026 AFGFMS0837–0842 batch never appeared in it). td_product stays
 * current. Discovered when the 2026 year tab showed 4 designs instead of ~122.
 *
 * Usage:
 *   npx tsx scripts/import-catalog.ts
 */
import { parseSku } from "../lib/sku-parser";
import { chunkedUpsert, getAdminClient } from "./_supabase-admin";

const PAGE_SIZE = 1000;
const PREFIXES = ["AFGF", "AFHF"] as const;

interface CatalogAgg {
  designFamily: string;
  themeCode: string;
  skuNumber: number;
  designName: string; // first non-empty Description we see
  productTypes: Set<string>;
  catalogCreatedDate: string | null; // earliest Date Created across SKUs in this family
  baseSku: string; // shortest AFGF SKU (fallback: shortest AFHF), used to build image URL
  hasMonogram: boolean;
  hasPersonalized: boolean;
  hasPreprint: boolean;
  hasBare: boolean;
}

const IMAGE_URL_BASE = "https://images.clownantics.com/CA_resize_500_500/";

function imageUrlForSku(sku: string): string {
  return `${IMAGE_URL_BASE}${sku.toLowerCase()}.jpg`;
}

interface ProductRow {
  SKU: string | null;
  Description: string | null;
  Status: string | null;
  "Date Created": string | null;
}

async function main() {
  const client = getAdminClient();
  const designs = new Map<string, CatalogAgg>();
  let rows = 0;
  let skippedParse = 0;

  for (const prefix of PREFIXES) {
    console.log(`Reading td_product (SKU ${prefix}%, Status=Active)…`);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await client
        .from("td_product")
        .select('SKU,Description,Status,"Date Created"')
        .ilike("SKU", `${prefix}%`)
        .eq("Status", "Active")
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(`td_product read failed at offset ${offset}: ${error.message}`);
      const page = (data || []) as ProductRow[];

      for (const r of page) {
        rows++;
        const sku = (r.SKU || "").trim().toUpperCase();
        const description = (r.Description || "").trim();
        const dateCreated = r["Date Created"] ? String(r["Date Created"]).slice(0, 10) : null;

        const parsed = parseSku(sku);
        if (!parsed) {
          skippedParse++;
          continue;
        }

        let agg = designs.get(parsed.designFamily);
        if (!agg) {
          agg = {
            designFamily: parsed.designFamily,
            themeCode: parsed.themeCode,
            skuNumber: parsed.skuNumber,
            designName: cleanName(description),
            productTypes: new Set([parsed.productType]),
            catalogCreatedDate: dateCreated,
            baseSku: sku,
            hasMonogram: false,
            hasPersonalized: false,
            hasPreprint: false,
            hasBare: false,
          };
          designs.set(parsed.designFamily, agg);
        } else {
          if (!agg.designName && description) agg.designName = cleanName(description);
          if (dateCreated && (!agg.catalogCreatedDate || dateCreated < agg.catalogCreatedDate)) {
            agg.catalogCreatedDate = dateCreated;
          }
          agg.productTypes.add(parsed.productType);
          // Image URL: prefer a garden SKU; among same-prefix candidates take the shortest.
          const aggIsGarden = agg.baseSku.startsWith("AFGF");
          const newIsGarden = sku.startsWith("AFGF");
          if ((newIsGarden && !aggIsGarden) || (newIsGarden === aggIsGarden && sku.length < agg.baseSku.length)) {
            agg.baseSku = sku;
          }
        }

        if (parsed.variant === "monogram") agg.hasMonogram = true;
        else if (parsed.variant === "personalized") agg.hasPersonalized = true;
        else if (parsed.variant === "preprint") agg.hasPreprint = true;
        else agg.hasBare = true;
      }

      process.stdout.write(`  ${prefix}: ${rows} rows so far\r`);
      if (page.length < PAGE_SIZE) break;
    }
    process.stdout.write("\n");
  }

  // Distribution for sanity-checking the run.
  const typeDist = new Map<string, number>();
  for (const d of designs.values()) {
    const k = [...d.productTypes].sort().join(",");
    typeDist.set(k, (typeDist.get(k) || 0) + 1);
  }

  console.log("\nSummary:");
  console.log(`  active SKU rows read:  ${rows}`);
  console.log(`  design families:       ${designs.size}`);
  console.log(`  skipped (parse):       ${skippedParse}`);
  console.log("  product_types distribution:");
  for (const [k, v] of [...typeDist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(5)}  [${k}]`);
  }
  console.log("");

  // Build upsert payload. We DO NOT touch units_*, first_sale_date,
  // last_sale_date, or shopify_tags — those come from later imports.
  const designRows = Array.from(designs.values()).map((d) => ({
    design_family: d.designFamily,
    design_name: d.designName || null,
    product_types: Array.from(d.productTypes).sort(),
    theme_code: d.themeCode,
    sku_number: d.skuNumber,
    is_active: true,
    catalog_created_date: d.catalogCreatedDate,
    image_url: imageUrlForSku(d.baseSku),
    has_monogram: d.hasMonogram,
    has_personalized: d.hasPersonalized,
    has_preprint: d.hasPreprint,
  }));

  console.log(`Upserting ${designRows.length} catalog designs…`);
  await chunkedUpsert("designs", designRows, client, "design_family");
  console.log(`\nDone. Run: npx tsx scripts/import-teamdesk.ts (full pipeline) or npx tsx scripts/classify.ts (refresh only)`);
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
