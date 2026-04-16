/**
 * Import TeamDesk invoice line-item export → designs + sku_variants tables.
 *
 * Usage:
 *   npx tsx scripts/import-teamdesk.ts                  # uses DEFAULT_CSV
 *   npx tsx scripts/import-teamdesk.ts ./data/foo.csv
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import "dotenv/config";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse";
import { parseSku } from "../lib/sku-parser";
import { chunkedUpsert, getAdminClient } from "./_supabase-admin";

const DEFAULT_CSV =
  "C:/Users/gbcab/ClownAntics Dropbox/Blake Cabot/Docs/Internet Business/200904 Clown/202604 AF Research App/Invoice Line Items_AF Image Review Export.csv";

// OrderSourceCalc → designs.* column. null = skip the row entirely.
const CHANNEL_MAP: Record<string, keyof DesignAggregate["units"] | null> = {
  FL: "fl",
  JF: "jf",
  FLAMZ: "flamz",
  "FL FBA": "fl_fba",
  "FL WFS": "fl_walmart",
  "FL Walmart": "fl_walmart",
  "AF Etsy": "af_etsy",
  "JF Etsy": "af_etsy", // merged per spec
  CA: null,
  "FLAMZ CAN": null,
};

interface DesignAggregate {
  designFamily: string;
  themeCode: string;
  skuNumber: number;
  designName: string;
  productTypes: Set<string>;
  imageUrl: string | null;
  firstSale: string;
  lastSale: string;
  units: {
    fl: number;
    jf: number;
    flamz: number;
    fl_fba: number;
    fl_walmart: number;
    af_etsy: number;
  };
}

interface SkuVariantRow {
  sku: string;
  design_family: string;
  variant_type: string;
  product_type: string;
}

async function main() {
  const csvPath = resolve(process.argv[2] || DEFAULT_CSV);
  console.log(`Reading: ${csvPath}\n`);

  const designs = new Map<string, DesignAggregate>();
  const skuVariants = new Map<string, SkuVariantRow>();
  const unknownChannels = new Map<string, number>();
  let rows = 0;
  let skippedNoParse = 0;
  let skippedUkraine = 0;
  let skippedChannel = 0;

  const parser = createReadStream(csvPath).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  );

  for await (const r of parser as AsyncIterable<Record<string, string>>) {
    rows++;
    const rawSku = r["SKU"];
    const description = r["SKU - Description"] || "";
    const orderDate = r["Order Number - Date"];
    const source = r["Order Number - OrderSourceCalc"] || "";
    const qty = Number(r["Quantity"] || "0");
    const imageUrl = r["SKU - Image - imgLocationFTP500"] || null;

    const parsed = parseSku(rawSku);
    if (!parsed) {
      skippedNoParse++;
      continue;
    }
    if (/ukraine/i.test(description)) {
      skippedUkraine++;
      continue;
    }
    if (!(source in CHANNEL_MAP)) {
      unknownChannels.set(source, (unknownChannels.get(source) || 0) + 1);
      continue;
    }
    const channelCol = CHANNEL_MAP[source];
    if (channelCol === null) {
      skippedChannel++;
      continue;
    }

    // Track SKU variant
    const skuKey = rawSku.trim().toUpperCase();
    if (!skuVariants.has(skuKey)) {
      skuVariants.set(skuKey, {
        sku: skuKey,
        design_family: parsed.designFamily,
        variant_type: parsed.variant,
        product_type: parsed.productType,
      });
    }

    // Aggregate at design_family level
    let agg = designs.get(parsed.designFamily);
    if (!agg) {
      agg = {
        designFamily: parsed.designFamily,
        themeCode: parsed.themeCode,
        skuNumber: parsed.skuNumber,
        designName: cleanName(description),
        productTypes: new Set(),
        imageUrl: null,
        firstSale: orderDate,
        lastSale: orderDate,
        units: {
          fl: 0,
          jf: 0,
          flamz: 0,
          fl_fba: 0,
          fl_walmart: 0,
          af_etsy: 0,
        },
      };
      designs.set(parsed.designFamily, agg);
    }
    if (parsed.productType !== "unknown") agg.productTypes.add(parsed.productType);
    if (!agg.imageUrl && imageUrl) agg.imageUrl = imageUrl;
    if (orderDate < agg.firstSale) agg.firstSale = orderDate;
    if (orderDate > agg.lastSale) agg.lastSale = orderDate;
    agg.units[channelCol] += qty;

    if (rows % 10000 === 0) {
      process.stdout.write(`  parsed ${rows} rows…\r`);
    }
  }
  process.stdout.write(`  parsed ${rows} rows\n\n`);

  console.log(`Summary:`);
  console.log(`  designs:           ${designs.size}`);
  console.log(`  unique SKUs:       ${skuVariants.size}`);
  console.log(`  skipped (no AF):   ${skippedNoParse}`);
  console.log(`  skipped (ukraine): ${skippedUkraine}`);
  console.log(`  skipped (channel): ${skippedChannel}`);
  if (unknownChannels.size > 0) {
    console.log(`  unknown channels (not skipped, not counted):`);
    for (const [k, v] of unknownChannels.entries()) {
      console.log(`    ${k}: ${v}`);
    }
  }
  console.log("");

  // Build upsert payloads
  const designRows = Array.from(designs.values()).map((d) => {
    const totals =
      d.units.fl +
      d.units.jf +
      d.units.flamz +
      d.units.fl_fba +
      d.units.fl_walmart +
      d.units.af_etsy;
    return {
      design_family: d.designFamily,
      design_name: d.designName || null,
      product_types: Array.from(d.productTypes),
      theme_code: d.themeCode,
      sku_number: d.skuNumber,
      image_url: d.imageUrl,
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

  const client = getAdminClient();
  console.log(`Upserting ${designRows.length} designs…`);
  await chunkedUpsert("designs", designRows, client, "design_family");
  console.log(`Upserting ${variantRows.length} sku_variants…`);
  await chunkedUpsert("sku_variants", variantRows, client, "sku");
  console.log(`\nDone. Run: npx tsx scripts/classify.ts`);
}

/**
 * Strip leading "America Forever" / "Garden Flag - " / "House Flag - " prefixes
 * to keep the design name short for the card UI.
 */
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
