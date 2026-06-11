/**
 * Run the full Supabase-sourced data refresh chain, in order:
 *
 *   1. import-catalog.ts          — new designs → year tabs
 *   2. import-teamdesk.ts         — units, channels, sale dates, sku_variants
 *   3. import-monthly-sales.ts    — monthly series for Months ▾ + charts
 *   4. rebuild-product-types.ts   — merge sales-derived product types
 *   5. classify.ts                — hit/solid/ok/weak/dead bands
 *
 * This is what the weekly GitHub Actions cron runs. No CSVs needed — every
 * step reads live td_* tables in Supabase. Fails fast: if a step errors,
 * later steps don't run and the process exits non-zero (so the Actions run
 * shows red).
 *
 * The JF-tags and themes imports are NOT in this chain — they read manual
 * Shopify/TeamDesk CSV exports and only need re-running when products get
 * re-tagged. See docs/DATA_UPDATE.md.
 *
 * Usage:
 *   npx tsx scripts/refresh-all.ts
 */
import { execSync } from "node:child_process";

const STEPS = [
  "import-catalog.ts",
  "import-teamdesk.ts",
  "import-monthly-sales.ts",
  "rebuild-product-types.ts",
  "classify.ts",
];

for (const step of STEPS) {
  console.log(`\n========== ${step} ==========\n`);
  execSync(`npx tsx scripts/${step}`, { stdio: "inherit" });
}

console.log("\nAll refresh steps completed.");
