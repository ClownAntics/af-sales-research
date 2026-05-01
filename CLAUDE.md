@AGENTS.md

# AF Sales Research — project notes

Internal dashboard answering: *"Which AF designs succeeded since 2023, and what patterns explain why?"*

## Local dev gotcha — DO NOT run `npm run build` here

This repo lives inside a Dropbox-synced folder. Dropbox holds open file handles on `.next/static/chunks` and `.next/export` while syncing, which makes Next.js's pre-build cleanup fail with `EBUSY: resource busy or locked, rmdir`. The compile + page generation actually finishes ("Generating static pages 4/4 in N s") before the cleanup blows up — but the build still exits with an error, which is misleading.

**Use `npx tsc --noEmit` for the pre-push sanity check instead.** It catches every type error the Vercel build would catch, runs in seconds, and doesn't touch `.next/`. Vercel itself builds in a clean environment with no Dropbox, so production builds always succeed even when local builds error.

If you genuinely need a production build locally (e.g. profiling), pause Dropbox sync first.

## SKU parsing rules

| SKU pattern | Example | design_family | product_type | variant |
|---|---|---|---|---|
| `AF` + `GF` + body | `AFGFSU0419` | `AFSU0419` | `garden` | none |
| `AF` + `HF` + body | `AFHFSU0430` | `AFSU0430` | `house` | none |
| `AF` + `GB` + body | `AFGBSP0004` | `AFSP0004` | `garden-banner` | none |
| any ending `WH` | `AFGFMS0509WH` | `AFMS0509` | `garden` | preprint |
| any ending `-CF` | `AFGFMS0447-CF` | `AFMS0447` | `garden` | personalized |
| any ending single A–Z (after digit) | `AFGFMS0136M` | `AFMS0136` | `garden` | monogram |
| `CUSTOMGARDENSKU` / `CUSTOMHOUSESKU` | | EXCLUDE | — | — |

**Aggregate at `design_family` level.** Variant + SKU detail lives in `sku_variants` for drill-down. The same `design_family` collects garden + house + banner sales together (e.g. `AFHFSP0662` rolls up into `AFSP0662`).

`design_family` decomposes further into `theme_code` (2-letter — `SP`, `SU`, `FA`, `WR`, `MS`, `US`, `UK`) + `sku_number` (numeric tail). Theme code groups designs by season/topic; SKU numbers are sequential within a theme.

## Import order (matters)
1. **`import-catalog.ts`** — seeds `designs` from `Products_AF Image Review Export.csv`. **AFGF active SKUs only**. Sets `is_active`, `theme_code`, `sku_number`, `product_types=['garden']`, and `catalog_created_date` (earliest `Date Created` across SKUs in the family).
2. **`import-teamdesk.ts`** — overlays sales onto existing rows; inserts new rows for house/banner-only designs not in the AFGF catalog. Match key is `design_family`, so house sales of a design count toward the same family as the catalog garden entry.
3. **`import-jf-tags.ts`** — adds flat Shopify `tags`. Deletes Ukraine designs.
4. **`import-themes.ts`** — decomposes `shopify_tags` into hierarchical `theme_names` / `sub_themes` / `sub_sub_themes` arrays by looking each tag up in the `FL Themes_zz Export View.csv` taxonomy (matched case-insensitive on `Search Term`). Tags with no matching theme are silently ignored — top-15 unmatched tags are logged at the end of the import for taxonomy maintenance.
5. **`import-monthly-sales.ts`** — re-parses the same invoice CSV and aggregates units per `design_family` per calendar month into four jsonb columns:
   - `monthly_sales` — family aggregate (all variants summed)
   - `monthly_sales_garden`, `monthly_sales_house`, `monthly_sales_garden_banner` — per-variant siblings, same shape, nullable when the variant has zero sales
   
   Shape: `[{m: 'YYYY-MM', u: units}, …]` ascending; zero-sales months omitted. Powers the per-design sales chart, the `Months ▾` seasonal filter, and the variant-aware tile counts when `Type` is set. Variant columns sum to the family aggregate within rounding (the gap is just `unknown`-product-type units, very rare). Can run any time after invoices.
6. **`rebuild-product-types.ts`** — rewrites `designs.product_types` from `sku_variants` (the only trustworthy source). Must run after `import-teamdesk` because catalog seeds every AFGF row with `['garden']` only and the teamdesk upsert can't be relied on to expand the array — without this step the `Type=house` and `Type=garden-banner` filters under-report by ~99%.
7. **`classify.ts`** — winner / middle / loser, `has_*` variant flags, and `date_is_estimated = (first_sale_date IS NULL)`.

## Date display rule
Dashboard year tabs filter on `effective_date` (generated column = `coalesce(catalog_created_date, first_sale_date)`). Catalog `Date Created` wins — that's when the design was added to the catalog, which we treat as proxy-creation date. First-sale fallback covers ~71 house/banner-only designs that have no AFGF catalog row.

When `date_is_estimated` is true (no sales yet — only catalog Date Created), the card prefixes the date with `★` and italicises it.

We previously interpolated estimated dates from neighboring SKU sales — abandoned because first-sale-date is a function of demand within an arbitrary 3-year sales window, not creation.

## Month-range filter (`Months ▾`)
Bounded seasonal filter sitting alongside the year tabs. The popover takes:
- A start month + end month (`end >= start` enforced — no wrap-around).
- A set of calendar years (checkboxes; defaults to every entry in `AVAILABLE_YEARS`).

`MonthRange = { start: 1-12, end: 1-12, years: number[] }`. A design is kept if `monthly_sales` has any `{m, u}` where the parsed `(year, month)` matches `years.includes(year) && start <= month <= end` with `u > 0`.

Implementation lives in [`lib/month-range.ts`](./lib/month-range.ts) (single source of truth for `MONTH_NAMES`, `AVAILABLE_YEARS`, `monthInRange`, `unitsInMonthRange`, `hasSalesInMonthRange`, `rangeLabel`, `futureMonthsInRange`, `pickMonthlySource`). Filter, sort, per-tile in-range units, and the future-month warning all run client-side — no API change needed because every `monthly_sales*` column is already in the `select("*")` payload.

`pickMonthlySource(design, productType)` is the single dispatch point: when `productType === "garden" | "house" | "garden-banner"` it returns the matching `monthly_sales_*` column; for any other value (`"all"`, `undefined`, etc.) it falls back to the family aggregate. `unitsInMonthRange` and `hasSalesInMonthRange` accept an optional `productType` argument and route through it, so a single call site change in `app/page.tsx` (passing `filters.productType`) flips both the filter and the displayed counts to variant-aware. The Design type carries all four columns optionally — when the variant column is null/absent the helper falls back to the aggregate, so the dashboard never breaks if the import script hasn't run since the schema was extended.

`AVAILABLE_YEARS` is hardcoded `[2023, 2024, 2025, 2026]` — bump every January when a new year of invoice data starts arriving.

Year tab and month range are mutually exclusive. When a range is active:
- The API request omits `view` so all classifications come back; the view filter is applied client-side. This keeps every summary tile populated regardless of which classification the user clicked.
- The grid sorts by in-range units descending (tiebreak: `design_family`).
- Each tile shows `<in-range> in <label> · <lifetime> total` instead of `<lifetime> · <rate>/yr`. `<label>` is `"May–Jun"` (all years) → `"May–Jun 2024"` (single year) → `"May–Jun 2024,2025"` (subset). When the `Type` filter narrows to a specific variant, both numbers come from the matching `monthly_sales_*` column and the tile suffixes the variant name (e.g. `"142 garden in May 2025 · 264 garden total"`).
- The summary card recompute uses the month-range set (search applied, view ignored), bucketed by each design's lifetime classification.
- The popover surfaces an inline amber warning when any selected `(year, month)` is in the future (`futureMonthsInRange`); Apply is still allowed.

## Channel mapping (TeamDesk OrderSourceCalc → designs.units_*)

| Source | Column |
|---|---|
| `FL` | `units_fl` |
| `JF` | `units_jf` |
| `FLAMZ` | `units_flamz` |
| `FL FBA` | `units_fl_fba` |
| `FL WFS` | `units_fl_walmart` |
| `FL Walmart` | `units_fl_walmart` |
| `AF Etsy` | `units_af_etsy` |
| `JF Etsy` | `units_af_etsy` (merged) |
| `CA` | skipped |
| `FLAMZ CAN` | skipped |

The mapping is a constant in `scripts/import-teamdesk.ts`. Unknown sources are logged at the end of import.

## Classification thresholds
- `units_total >= 6` → `winner`
- `units_total 1–5` → `middle`
- `units_total = 0` → `loser`

## Exclusions
None currently. Ukraine designs were previously filtered out (one-off 2022 fundraiser) but are now included.

## Supabase pattern
- Browser + API route use the **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). RLS allows public SELECT on `designs` and `sku_variants` (see `supabase/schema.sql`).
- Import scripts use the **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) via `scripts/_supabase-admin.ts`. Service-role key MUST stay in `.env.local` only — never `NEXT_PUBLIC_*`.

## Visual target
Flat aesthetic: white cards on `--background` (#fafafa), 1px `--border` (#e4e4e7), `rounded-lg`, muted text. No tag pills on cards — just image + name + units + first-sold date. Year tabs above summary cards. Summary cards are clickable to switch the view filter.
