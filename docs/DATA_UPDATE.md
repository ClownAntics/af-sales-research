# Updating the data

There are two refresh paths now — pick the right one for the situation:

| What you need | How |
|---|---|
| **Fresher sales + catalog data** (new designs in year tabs, unit totals, channel breakdowns, Months ▾ filter, sales charts, classifications) | **Supabase-sourced — no CSVs needed.** Run the five-script refresh chain below, or let the weekly GitHub Actions cron do it. To force a run sooner: GitHub repo → Actions tab → **Refresh monthly sales** → **Run workflow**. |
| **Themes and tags** (Shopify tags, theme hierarchy) | **Manual.** Re-export the two remaining CSVs and run `import-jf-tags.ts` + `import-themes.ts`. Only needed when products get re-tagged or new themes are added — every month or two is plenty. |

**The Supabase-sourced refresh chain** (runs anywhere with the repo + `.env.local`, ~8 min total):

```bash
npx tsx scripts/import-catalog.ts          # new designs → year tabs
npx tsx scripts/import-teamdesk.ts         # units, channels, sale dates, sku_variants
npx tsx scripts/import-monthly-sales.ts    # monthly series for Months ▾ + charts
npx tsx scripts/rebuild-product-types.ts   # merge sales-derived product types
npx tsx scripts/classify.ts                # hit/solid/ok/weak/dead bands
```

For the manual (themes/tags) path you'll need:
- A laptop with the project cloned locally
- Node 22+ and `npx` installed
- The two CSV exports (see below)
- The Supabase service role key in your `.env.local`

---

## Weekly monthly-sales refresh (automated)

Lives at [`.github/workflows/refresh-monthly-sales.yml`](../.github/workflows/refresh-monthly-sales.yml). Runs `npx tsx scripts/import-monthly-sales.ts` on a GitHub Actions runner. Schedule, secrets, and manual-trigger button are all configured in that file — edit the `cron:` line if you want a different cadence.

**Required GitHub repo secrets** (Settings → Secrets and variables → Actions):
- `NEXT_PUBLIC_SUPABASE_URL` — the Supabase project URL (same value as `.env.local`)
- `SUPABASE_SERVICE_ROLE_KEY` — the service-role key (same value as `.env.local`)

Without those two secrets the workflow runs but exits with "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars". Add them once and forget about it.

The workflow is *idempotent* — re-running it just re-aggregates and re-upserts. No harm in triggering manually whenever you want fresher data.

---

## The two CSVs

Both live in the parent docs folder:
`C:\Users\gbcab\ClownAntics Dropbox\Blake Cabot\Docs\Internet Business\200904 Clown\202604 AF Research App\`

| File | Source | Contents | Required columns |
|---|---|---|---|
| `JF Tag Export.csv` | JustForFun Shopify admin | Product tags + variant SKUs | `Title`, `Type`, `Tags`, `Variant SKU` |
| `FL Themes_zz Export View.csv` | TeamDesk | Theme taxonomy (Theme → Sub-theme → Sub-sub-theme) | `Search Term`, `Name`, `Sub Theme`, `Sub Sub Theme`, `Level`, `isBusinessTheme?` |

> `Products_AF Image Review Export.csv` and `Invoice Line Items_AF Image Review Export.csv` are **no longer needed** — `import-catalog.ts` reads the live `td_product` table and `import-teamdesk.ts` / `import-monthly-sales.ts` read the live `td_invoice_line_item` + `td_order` tables. (The old TeamDesk export views also silently omitted some products, which is why the 2026 year tab once showed only 4 designs.)

---

## How to export each CSV

**Important:** the column headers must match exactly. If an export renames a column, the import script will silently miss it. If something looks off after import, the first thing to check is whether a column header changed.

### JF Shopify tag export

1. Log into the JustForFun Shopify admin: https://admin.shopify.com/store/justforfunflags
2. **Products → Export → Plain CSV file → All products → Export products**
3. Shopify emails you a download link (~5 minutes)
4. Save it as `JF Tag Export.csv` in the docs folder

### FL Themes export

This rarely changes. You only need to re-export if you've added new themes to the FL Themes table in TeamDesk.

1. TeamDesk → FL Themes table → `zz Export View`
2. **Export → CSV**
3. Save as `FL Themes_zz Export View.csv` in the docs folder

---

## Running the imports

Open a terminal in the project folder:
```bash
cd "C:\Users\gbcab\ClownAntics Dropbox\Blake Cabot\Docs\Internet Business\200904 Clown\202604 AF Research App\af-sales-research"
```

Then run all seven scripts **in this exact order**:

```bash
npx tsx scripts/import-catalog.ts
npx tsx scripts/import-teamdesk.ts
npx tsx scripts/import-jf-tags.ts
npx tsx scripts/import-themes.ts
npx tsx scripts/import-monthly-sales.ts
npx tsx scripts/rebuild-product-types.ts
npx tsx scripts/classify.ts
```

Total time: about 6 minutes. Each script prints a summary at the end — read them, they tell you how many designs got loaded and what was skipped.

---

## What each import does

| Script | Reads | Writes | Time |
|---|---|---|---|
| `import-catalog.ts` | **Supabase table `td_product`** (not a CSV) | Seeds `designs` table with every Active AFGF/AFHF design (~2,900 families). Sets theme_code, sku_number, is_active, product_types (garden/house from the catalog), catalog_created_date, image_url, has_* flags. **Runs any time without a CSV** — this is what makes newly created designs appear in the year tabs. | ~1min |
| `import-teamdesk.ts` | **Supabase tables `td_invoice_line_item` + `td_order`** (not a CSV) | Overlays sales onto designs (units_total, per-channel units, first/last sale dates). Inserts house/banner-only designs not in catalog. Populates `sku_variants`. FL-company channels only; skips `flagValidSale=false`; window starts 2023-01-01. Preserves catalog-derived names/images/types. | ~3min |
| `import-jf-tags.ts` | JF Shopify CSV | Adds `shopify_tags`. Deletes Ukraine designs. | ~1min |
| `import-themes.ts` | FL Themes CSV | Decomposes shopify_tags into hierarchical theme arrays (theme_names, sub_themes, sub_sub_themes). Drops Business / Features / Size buckets. | ~1min |
| `import-monthly-sales.ts` | **Supabase tables `td_invoice_line_item` + `td_order`** (not the CSV) | Aggregates units per design per calendar month into four jsonb columns: `monthly_sales` (family aggregate, all variants combined) plus `monthly_sales_garden` / `monthly_sales_house` / `monthly_sales_garden_banner` (per-variant). Filters to FL-company channels only (skips CA, FP, AMZ-anything, etc.) and skips rows with `flagValidSale=false`. Powers the design-detail sales chart, the **Months ▾** seasonal filter, and the variant-aware unit counts shown when the **Type** filter is set. **You can run this script any time, even without a fresh CSV in the docs folder** — it pulls live data straight from Supabase. | ~3min |
| `rebuild-product-types.ts` | (DB only) | Rebuilds `designs.product_types` from `sku_variants` (sales-derived). Catalog now sets garden/house directly from `td_product`, but this step still adds `garden-banner` (banners aren't in the catalog import) and covers designs that only exist via the sales overlay. | ~20s |
| `classify.ts` | (DB only) | Sets classification (hit/solid/ok/weak/dead), date_is_estimated flag, and has_preprint/personalized/monogram booleans. | ~30s |

**Order matters:**
- Catalog must run before invoices (so house sales overlay onto pre-seeded garden families).
- JF tags must run before themes (themes is built from tags).
- Monthly sales can run any time after invoices.
- **Rebuild product types must run after teamdesk** (teamdesk populates `sku_variants`).
- Classify must run last (depends on the final units_total).

**If you skip `import-monthly-sales.ts`**, the dashboard still works, but the **Months ▾** seasonal filter and the per-design sales chart will be empty for any design imported since the last monthly-sales run.

**If you skip `rebuild-product-types.ts`**, the **Type** filter on the dashboard breaks for `house` and `garden-banner` (returns almost no results). Always run it.

---

## Checking it worked

After all scripts finish, open the dashboard: **https://af-sales-research.vercel.app**

Quick sanity checks:
- Click **Designs** card — total should be ~2,900
- Click **Hit** — should be a few hundred
- Open the **Patterns** view — Win % bars should populate
- Pick the latest year tab — should show recent design count

If any number looks wildly off compared to the last run, something probably broke. Check the import script output for warnings.

---

## Common problems

### "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
Your `.env.local` is missing or in the wrong place. Should be at:
`af-sales-research/.env.local` with these three lines:
```
NEXT_PUBLIC_SUPABASE_URL=https://rilhgeshkypbcckedaoh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```
Get these from the Supabase dashboard → Project Settings → API Keys.

### "Cannot find file: Products_AF Image Review Export.csv"
The CSV isn't in the docs folder, or has a different filename. Check the path. Filenames must match exactly (case-sensitive on some systems).

### Numbers look wrong
Compare against the previous run. Common causes:
- A CSV column was renamed in TeamDesk → import skips it silently. Check the script's output for low row counts.
- Catalog wasn't refreshed before invoices ran → new SKUs missing from designs table.
- A new sales channel appeared in the data that the channel mapping doesn't recognize → look for "unknown channels" in the teamdesk import output, then update `CHANNEL_MAP` in `scripts/import-teamdesk.ts`.

### Re-running from a clean slate
If the data is corrupted and you want to start over, run this in the Supabase SQL Editor first:
```sql
truncate table sku_variants;
truncate table designs cascade;
```
Then run the seven import scripts in order.

### Schema migrations
Most days you don't need to think about this — the `import-*` scripts only write to columns that already exist. But if a new feature adds a column (the per-variant `monthly_sales_*` columns are an example), the migration has to be applied manually because Supabase's JS client can't run DDL. The canonical schema lives in [`supabase/schema.sql`](../supabase/schema.sql); the `add column if not exists` blocks at the bottom of that file are safe to paste into the **Supabase SQL Editor** and re-run any time. If an import errors with `Could not find the 'foo' column`, that's the symptom — check schema.sql, run the missing `alter table` block in the editor, and retry.

---

## Pushing changes (optional)

If you edit any code or scripts:

```bash
git add -A
git commit -m "describe what you changed"
git push
```

Vercel auto-deploys within ~30 seconds of the push. The live dashboard at **https://af-sales-research.vercel.app** picks up the new version automatically.
