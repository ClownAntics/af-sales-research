/**
 * Rebuild `designs.product_types` from `sku_variants` — the trustworthy source.
 *
 * Why this exists: import-catalog seeds every AFGF active SKU with
 * product_types=['garden'] (catalog is garden-only). import-teamdesk attempts
 * to expand the array with 'house' / 'garden-banner' as it sees those SKU
 * variants in invoices, but its upsert can lose to a later catalog run, leaving
 * almost every multi-variant design tagged ['garden'] only — which silently
 * breaks the dashboard's Type=house and Type=garden-banner filters.
 *
 * sku_variants is correct (it's set per-row from the parsed SKU). This script
 * groups it by design_family and writes the de-duped product_types array back
 * onto each design row.
 *
 * Run as the LAST step of the import pipeline (after import-teamdesk) — see
 * docs/DATA_UPDATE.md.
 *
 * Usage:
 *   npx tsx scripts/rebuild-product-types.ts
 */
import { chunkedUpsert, getAdminClient } from "./_supabase-admin";

interface VariantRow {
  design_family: string;
  product_type: string | null;
}

async function main() {
  const c = getAdminClient();

  // 1) Pull every sku_variants row (paginated). The table has only 4 columns
  //    so the payload is small.
  console.log("Reading sku_variants…");
  const variants: VariantRow[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await c
      .from("sku_variants")
      .select("design_family,product_type")
      .order("sku")
      .range(off, off + 999);
    if (error) throw new Error(`sku_variants read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    variants.push(...(data as VariantRow[]));
    if (data.length < 1000) break;
  }
  console.log(`  ${variants.length} variant rows`);

  // 2) Group product_types by design_family (skip null/unknown).
  const byFamily = new Map<string, Set<string>>();
  for (const v of variants) {
    if (!v.design_family) continue;
    const pt = v.product_type;
    if (!pt || pt === "unknown") continue;
    let s = byFamily.get(v.design_family);
    if (!s) {
      s = new Set();
      byFamily.set(v.design_family, s);
    }
    s.add(pt);
  }
  console.log(`  ${byFamily.size} distinct design_families with at least one typed variant`);

  // Distribution log so we can spot-check the rebuild before it runs.
  const dist = new Map<string, number>();
  for (const types of byFamily.values()) {
    const k = [...types].sort().join(",");
    dist.set(k, (dist.get(k) || 0) + 1);
  }
  console.log(`\nNew product_types distribution:`);
  for (const [k, v] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  [${k}]`);
  }

  // 3) Upsert. We only update product_types — pass design_family as the conflict
  //    key and Supabase merges the column into the existing row.
  const rows = [...byFamily.entries()].map(([design_family, types]) => ({
    design_family,
    product_types: [...types].sort(),
  }));

  console.log(`\nUpserting product_types on ${rows.length} designs…`);
  await chunkedUpsert("designs", rows, c, "design_family");
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
