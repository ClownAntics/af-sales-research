# Updating the data

The dashboard does NOT auto-sync from TeamDesk or Shopify. Data refreshes only when someone manually re-runs the import scripts. Plan to do this every ~2 weeks before the brainstorm meeting.

You'll need:
- A laptop with the project cloned locally
- Node 22+ and `npx` installed
- The four CSV exports (see below)
- The Supabase service role key in your `.env.local`

---

## The four CSVs

All four live in the parent docs folder:
`C:\Users\gbcab\ClownAntics Dropbox\Blake Cabot\Docs\Internet Business\200904 Clown\202604 AF Research App\`

| File | Source | Contents | Required columns |
|---|---|---|---|
| `Products_AF Image Review Export.csv` | TeamDesk | Catalog of every AF garden flag SKU | `SKU`, `Description`, `Type - Label`, `Status`, `Date Created` |
| `Invoice Line Items_AF Image Review Export.csv` | TeamDesk | Every AF invoice line since 2023 | `Quantity`, `Order Number`, `Order Number - Date`, `Order Number - OrderSourceCalc`, `SKU`, `SKU - Description`, `SKU - Type - Label`, `SKU - Image - imgLocationFTP500` |
| `JF Tag Export.csv` | JustForFun Shopify admin | Product tags + variant SKUs | `Title`, `Type`, `Tags`, `Variant SKU` |
| `FL Themes_zz Export View.csv` | TeamDesk | Theme taxonomy (Theme → Sub-theme → Sub-sub-theme) | `Search Term`, `Name`, `Sub Theme`, `Sub Sub Theme`, `Level`, `isBusinessTheme?` |

---

## How to export each CSV

### TeamDesk Products + Invoices

Both come from the same TeamDesk database, different views.

1. Open TeamDesk → switch to the right database
2. Open the saved view (`AF Image Review Export` for both products and invoices)
3. Click **Export** → CSV → Save with the **exact same filename** (overwrite the old one)
4. Move the file into the docs folder above (it'll usually save to Downloads first)

**Important:** the column headers must match exactly. If TeamDesk renames a column, the import script will silently miss it. If something looks off after import, the first thing to check is whether a column header changed.

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

Then run all four scripts **in this exact order**:

```bash
npx tsx scripts/import-catalog.ts
npx tsx scripts/import-teamdesk.ts
npx tsx scripts/import-jf-tags.ts
npx tsx scripts/import-themes.ts
npx tsx scripts/classify.ts
```

Total time: about 5 minutes. Each script prints a summary at the end — read them, they tell you how many designs got loaded and what was skipped.

---

## What each import does

| Script | Reads | Writes | Time |
|---|---|---|---|
| `import-catalog.ts` | Products CSV | Seeds `designs` table with every Active garden flag (~2,800 designs). Sets theme_code, sku_number, is_active, catalog_created_date, image_url. | ~30s |
| `import-teamdesk.ts` | Invoices CSV | Overlays sales onto designs (units, dates, channel breakdown). Inserts house/banner-only designs not in catalog. Populates `sku_variants` table. | ~2min |
| `import-jf-tags.ts` | JF Shopify CSV | Adds `shopify_tags`. Deletes Ukraine designs. | ~1min |
| `import-themes.ts` | FL Themes CSV | Decomposes shopify_tags into hierarchical theme arrays (theme_names, sub_themes, sub_sub_themes). Drops Business / Features / Size buckets. | ~1min |
| `classify.ts` | (DB only) | Sets classification (hit/solid/ok/weak/dead), date_is_estimated flag, and has_preprint/personalized/monogram booleans. | ~30s |

**Order matters:**
- Catalog must run before invoices (so house sales overlay onto pre-seeded garden families).
- JF tags must run before themes (themes is built from tags).
- Classify must run last (depends on the final units_total).

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
Then run the five import scripts in order.

---

## Pushing changes (optional)

If you edit any code or scripts:

```bash
git add -A
git commit -m "describe what you changed"
git push
```

Vercel auto-deploys within ~30 seconds of the push. The live dashboard at **https://af-sales-research.vercel.app** picks up the new version automatically.
