/**
 * Compute classification + has_* booleans for every design.
 *
 * Run AFTER both import scripts.
 */
import "dotenv/config";
import { getAdminClient } from "./_supabase-admin";

async function main() {
  const client = getAdminClient();

  console.log("Setting classification (hit/solid/ok/weak/dead)…");
  // Thresholds (set from full-dataset distribution analysis):
  //   hit   : 100+ units  (~5.7% — top performers, the lessons)
  //   solid : 26–99       (~21.5% — reliable sellers)
  //   ok    : 6–25        (~40.6% — pulled their weight)
  //   weak  : 1–5         (~25.6% — sold trivially)
  //   dead  : 0           (~6.7% — never sold)

  const bands: { name: string; min: number; max: number | null }[] = [
    { name: "hit", min: 100, max: null },
    { name: "solid", min: 26, max: 99 },
    { name: "ok", min: 6, max: 25 },
    { name: "weak", min: 1, max: 5 },
    { name: "dead", min: 0, max: 0 },
  ];
  for (const b of bands) {
    let q = client.from("designs").update({ classification: b.name }).gte("units_total", b.min);
    if (b.max !== null) q = q.lte("units_total", b.max);
    const { error } = await q;
    if (error) throw new Error(`${b.name} update: ${error.message}`);
  }

  console.log("Setting date_is_estimated flag…");
  // True = no real first sale, only the catalog Date Created. False = has a real sale.
  const { error: eA } = await client
    .from("designs")
    .update({ date_is_estimated: true })
    .is("first_sale_date", null);
  if (eA) throw new Error(`date_is_estimated true: ${eA.message}`);
  const { error: eB } = await client
    .from("designs")
    .update({ date_is_estimated: false })
    .not("first_sale_date", "is", null);
  if (eB) throw new Error(`date_is_estimated false: ${eB.message}`);

  console.log("Computing has_preprint / has_personalized / has_monogram…");
  const { data: variants, error: e4 } = await client
    .from("sku_variants")
    .select("design_family, variant_type");
  if (e4) throw new Error(`load variants: ${e4.message}`);

  const flags = new Map<
    string,
    { preprint: boolean; personalized: boolean; monogram: boolean }
  >();
  for (const v of variants || []) {
    const f = flags.get(v.design_family) || {
      preprint: false,
      personalized: false,
      monogram: false,
    };
    if (v.variant_type === "preprint") f.preprint = true;
    if (v.variant_type === "personalized") f.personalized = true;
    if (v.variant_type === "monogram") f.monogram = true;
    flags.set(v.design_family, f);
  }

  let i = 0;
  for (const [df, f] of flags.entries()) {
    const { error } = await client
      .from("designs")
      .update({
        has_preprint: f.preprint,
        has_personalized: f.personalized,
        has_monogram: f.monogram,
      })
      .eq("design_family", df);
    if (error) console.warn(`  ! ${df}: ${error.message}`);
    i++;
    if (i % 100 === 0) process.stdout.write(`  ${i}/${flags.size}\r`);
  }
  console.log(`  ${i}/${flags.size}`);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/*
-- Equivalent SQL (faster — paste into Supabase SQL editor instead of running this script):

UPDATE designs
SET classification = CASE
  WHEN units_total >= 100 THEN 'hit'
  WHEN units_total >=  26 THEN 'solid'
  WHEN units_total >=   6 THEN 'ok'
  WHEN units_total >=   1 THEN 'weak'
  ELSE 'dead'
END;

UPDATE designs SET date_is_estimated = (first_sale_date IS NULL);

WITH flags AS (
  SELECT
    design_family,
    bool_or(variant_type = 'preprint')     AS has_preprint,
    bool_or(variant_type = 'personalized') AS has_personalized,
    bool_or(variant_type = 'monogram')     AS has_monogram
  FROM sku_variants
  GROUP BY design_family
)
UPDATE designs d
SET has_preprint     = f.has_preprint,
    has_personalized = f.has_personalized,
    has_monogram     = f.has_monogram
FROM flags f
WHERE d.design_family = f.design_family;
*/
