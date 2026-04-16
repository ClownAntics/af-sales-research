@AGENTS.md

# AF Sales Research — project notes

Internal dashboard answering: *"Which AF designs succeeded since 2023, and what patterns explain why?"*

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
5. **`classify.ts`** — winner / middle / loser, `has_*` variant flags, and `date_is_estimated = (first_sale_date IS NULL)`.

## Date display rule
Dashboard year tabs filter on `effective_date` (generated column = `coalesce(catalog_created_date, first_sale_date)`). Catalog `Date Created` wins — that's when the design was added to the catalog, which we treat as proxy-creation date. First-sale fallback covers ~71 house/banner-only designs that have no AFGF catalog row.

When `date_is_estimated` is true (no sales yet — only catalog Date Created), the card prefixes the date with `★` and italicises it.

We previously interpolated estimated dates from neighboring SKU sales — abandoned because first-sale-date is a function of demand within an arbitrary 3-year sales window, not creation.

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
- Ukraine designs (description match `/ukraine/i` in TeamDesk, or any tag containing "Ukraine" in JF Shopify) — one-off event, not a repeatable pattern.

## Supabase pattern
- Browser + API route use the **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). RLS allows public SELECT on `designs` and `sku_variants` (see `supabase/schema.sql`).
- Import scripts use the **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) via `scripts/_supabase-admin.ts`. Service-role key MUST stay in `.env.local` only — never `NEXT_PUBLIC_*`.

## Visual target
Flat aesthetic: white cards on `--background` (#fafafa), 1px `--border` (#e4e4e7), `rounded-lg`, muted text. No tag pills on cards — just image + name + units + first-sold date. Year tabs above summary cards. Summary cards are clickable to switch the view filter.
