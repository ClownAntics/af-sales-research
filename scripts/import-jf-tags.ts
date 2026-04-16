/**
 * Import JF Shopify product export → designs.shopify_tags + image_url.
 *
 * Usage:
 *   npx tsx scripts/import-jf-tags.ts                 # uses DEFAULT_CSV
 *   npx tsx scripts/import-jf-tags.ts ./data/foo.csv
 *
 * Run AFTER scripts/import-teamdesk.ts so the design rows already exist.
 *
 * Behaviour:
 *   - Tags are unioned across all SKUs that share a design_family.
 *   - Designs with a "Ukraine" tag (case-insensitive) are deleted from the DB.
 *   - image_url is updated only if currently null (TeamDesk image takes priority).
 */
import "dotenv/config";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse";
import { parseSku } from "../lib/sku-parser";
import { getAdminClient } from "./_supabase-admin";

const DEFAULT_CSV =
  "C:/Users/gbcab/ClownAntics Dropbox/Blake Cabot/Docs/Internet Business/200904 Clown/202604 AF Research App/JF Tag Export.csv";

interface DesignTagAgg {
  designFamily: string;
  tags: Set<string>;
}

async function main() {
  const csvPath = resolve(process.argv[2] || DEFAULT_CSV);
  console.log(`Reading: ${csvPath}\n`);

  const byDesign = new Map<string, DesignTagAgg>();
  let rows = 0;
  let skipped = 0;

  const parser = createReadStream(csvPath).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  );

  for await (const r of parser as AsyncIterable<Record<string, string>>) {
    rows++;
    const sku = r["Variant SKU"];
    const tagsRaw = r["Tags"] || "";
    const parsed = parseSku(sku);
    if (!parsed) {
      skipped++;
      continue;
    }
    let agg = byDesign.get(parsed.designFamily);
    if (!agg) {
      agg = { designFamily: parsed.designFamily, tags: new Set() };
      byDesign.set(parsed.designFamily, agg);
    }
    for (const tag of tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)) {
      agg.tags.add(tag);
    }
  }
  console.log(`  parsed ${rows} rows (${skipped} skipped, ${byDesign.size} designs)\n`);

  // Identify Ukraine designs to delete
  const ukraineDesigns: string[] = [];
  const updates: { design_family: string; shopify_tags: string[] }[] = [];
  for (const d of byDesign.values()) {
    const hasUkraine = Array.from(d.tags).some((t) => /ukraine/i.test(t));
    if (hasUkraine) {
      ukraineDesigns.push(d.designFamily);
      continue;
    }
    updates.push({
      design_family: d.designFamily,
      shopify_tags: Array.from(d.tags).sort(),
    });
  }

  const client = getAdminClient();

  if (ukraineDesigns.length > 0) {
    console.log(`Deleting ${ukraineDesigns.length} Ukraine designs…`);
    const { error } = await client
      .from("designs")
      .delete()
      .in("design_family", ukraineDesigns);
    if (error) throw new Error(`Delete failed: ${error.message}`);
  }

  console.log(`Updating tags on ${updates.length} designs…`);
  // Update one-by-one so we don't clobber other columns. Postgrest doesn't
  // have a true partial-update batch API; this is fine for ~few-thousand rows.
  let i = 0;
  for (const u of updates) {
    const { error } = await client
      .from("designs")
      .update({ shopify_tags: u.shopify_tags })
      .eq("design_family", u.design_family);
    if (error) {
      // missing design row = imported via Shopify but no sales — skip silently
      if (!error.message.includes("0 rows")) {
        console.warn(`  ! ${u.design_family}: ${error.message}`);
      }
    }
    i++;
    if (i % 100 === 0) process.stdout.write(`  ${i}/${updates.length}\r`);
  }
  console.log(`  ${i}/${updates.length}`);
  console.log(`\nDone. Run: npx tsx scripts/classify.ts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
