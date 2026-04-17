/**
 * Seed the `designs` table from the AF garden-flag product catalog.
 *
 * Run FIRST (before import-teamdesk.ts), so the table contains every active
 * AFGF design — even ones that never sold. Sales data overlays on top.
 *
 * Filter rules (per addendum spec):
 *   - SKU starts with `AFGF` (garden flags only)
 *   - Status = `Active` only (drop Inactive / Pending / CA Discontinued)
 *   - Drop `AFGFCUSTOM`
 *
 * After SKU normalisation (strip GF/HF/GB + variant suffixes), ~5,200 active
 * SKUs collapse to ~2,800 design families.
 *
 * Usage:
 *   npx tsx scripts/import-catalog.ts                     # uses DEFAULT_CSV
 *   npx tsx scripts/import-catalog.ts ./data/foo.csv
 */
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse";
import { parseSku } from "../lib/sku-parser";
import { chunkedUpsert, getAdminClient } from "./_supabase-admin";

const DEFAULT_CSV =
  "C:/Users/gbcab/ClownAntics Dropbox/Blake Cabot/Docs/Internet Business/200904 Clown/202604 AF Research App/Products_AF Image Review Export.csv";

interface CatalogAgg {
  designFamily: string;
  themeCode: string;
  skuNumber: number;
  designName: string; // first non-empty Description we see
  productTypes: Set<string>;
  catalogCreatedDate: string | null; // earliest Date Created across SKUs in this family
  baseSku: string; // shortest AFGF SKU in the family (e.g. "AFGFSP0001"), used to build image URL
  hasMonogram: boolean;     // detected from -CF/WH/single-letter suffix in catalog SKUs
  hasPersonalized: boolean;
  hasPreprint: boolean;
  hasBare: boolean; // a SKU with no variant suffix exists (i.e. plain AFGFMS0085)
}

const IMAGE_URL_BASE = "https://images.clownantics.com/CA_resize_500_500/";

function imageUrlForSku(sku: string): string {
  return `${IMAGE_URL_BASE}${sku.toLowerCase()}.jpg`;
}

async function main() {
  const csvPath = resolve(process.argv[2] || DEFAULT_CSV);
  console.log(`Reading: ${csvPath}\n`);

  const designs = new Map<string, CatalogAgg>();
  let rows = 0;
  let skippedPrefix = 0;
  let skippedStatus = 0;
  let skippedCustom = 0;
  let skippedParse = 0;

  const parser = createReadStream(csvPath).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  );

  for await (const r of parser as AsyncIterable<Record<string, string>>) {
    rows++;
    const sku = (r["SKU"] || "").trim();
    const status = (r["Status"] || "").trim();
    const description = (r["Description"] || "").trim();
    const dateCreatedRaw = (r["Date Created"] || "").trim();
    // "2023-12-29 07:13:55" → "2023-12-29"; empty → null
    const dateCreated = dateCreatedRaw ? dateCreatedRaw.slice(0, 10) : null;

    // Garden flags only.
    if (!sku.toUpperCase().startsWith("AFGF")) {
      skippedPrefix++;
      continue;
    }
    if (sku.toUpperCase() === "AFGFCUSTOM") {
      skippedCustom++;
      continue;
    }
    if (status !== "Active") {
      skippedStatus++;
      continue;
    }

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
        productTypes: new Set(["garden"]),
        catalogCreatedDate: dateCreated,
        baseSku: sku.toUpperCase(),
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
      const upper = sku.toUpperCase();
      if (upper.length < agg.baseSku.length) agg.baseSku = upper;
    }

    // Track which suffix variants exist in the catalog. parseSku already
    // identifies the variant_type from the suffix.
    if (parsed.variant === "monogram") agg.hasMonogram = true;
    else if (parsed.variant === "personalized") agg.hasPersonalized = true;
    else if (parsed.variant === "preprint") agg.hasPreprint = true;
    else agg.hasBare = true;
  }

  console.log("Summary:");
  console.log(`  rows read:           ${rows}`);
  console.log(`  active garden families: ${designs.size}`);
  console.log(`  skipped (not AFGF):  ${skippedPrefix}`);
  console.log(`  skipped (custom):    ${skippedCustom}`);
  console.log(`  skipped (status):    ${skippedStatus}`);
  console.log(`  skipped (parse):     ${skippedParse}`);
  console.log("");

  // Build upsert payload. We DO NOT touch units_*, first_sale_date,
  // last_sale_date, image_url, or shopify_tags — those come from later imports.
  // We DO set is_active=true (so previously-loaded designs whose status flipped
  // to Active again get marked correctly), theme_code, sku_number, and product
  // types (garden), and the design name as a fallback.
  const designRows = Array.from(designs.values()).map((d) => ({
    design_family: d.designFamily,
    design_name: d.designName || null,
    product_types: Array.from(d.productTypes),
    theme_code: d.themeCode,
    sku_number: d.skuNumber,
    is_active: true,
    catalog_created_date: d.catalogCreatedDate,
    image_url: imageUrlForSku(d.baseSku),
    has_monogram: d.hasMonogram,
    has_personalized: d.hasPersonalized,
    has_preprint: d.hasPreprint,
  }));

  const client = getAdminClient();
  console.log(`Upserting ${designRows.length} catalog designs…`);
  await chunkedUpsert("designs", designRows, client, "design_family");
  console.log(`\nDone. Run: npx tsx scripts/import-teamdesk.ts`);
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
