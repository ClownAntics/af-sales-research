"use client";

import Image from "next/image";
import type { Design, MonthRange } from "@/lib/types";
import { pickMonthlySource, rangeLabel, unitsInMonthRange } from "@/lib/month-range";

/** Sum of all units across the variant-specific monthly_sales series. */
function variantLifetimeUnits(d: Design, productType: string): number {
  const source = pickMonthlySource(d, productType);
  let total = 0;
  for (const p of source) total += p.u;
  return total;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonthYear(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Build every variant SKU we know exists for a design family. For the
// canonical AF schema (e.g. `AFSP0419`) we expand to garden + house +
// optional banner — those `AFGF` / `AFHF` / `AFGB` strings ARE real
// Shopify SKUs. For everything else (Carson `CA52602`, burlap
// `afgfwr-b-0004`, etc.) the `design_family` IS the real SKU and we
// show it verbatim — never fabricate `AFGFCA52602` or similar.
interface VariantSku {
  sku: string;
  label: string;
  imageUrl: string;
}
const CANONICAL_AF = /^AF[A-Z]{2}\d{4}$/;
function variantSkus(design: Design): VariantSku[] {
  const family = design.design_family;
  // Prefer the Shopify-stored image_url. Fall back to the legacy
  // images.clownantics.com mirror constructed from the SKU — that pattern
  // only matches AF SKUs and 404s for Carson / burlap, but `image_url`
  // covers those when it's been pulled.
  const fallbackImg = (sku: string) =>
    `https://images.clownantics.com/CA_resize_500_500/${sku.toLowerCase()}.jpg`;
  const mk = (sku: string, label: string): VariantSku => ({
    sku,
    label,
    imageUrl: design.image_url || fallbackImg(sku),
  });
  // Non-canonical-AF family → design_family IS the SKU. Show as-is.
  if (!CANONICAL_AF.test(family)) {
    return [mk(family, "")];
  }
  const body = family.replace(/^AF/, "");
  // Canonical AF: some designs only exist as suffix variants:
  //   monogram      → per-letter SKUs (use "A" as canonical)
  //   personalized  → "-CF" suffix
  //   preprint      → "WH" suffix
  const suffix = design.has_monogram
    ? "A"
    : design.has_personalized
      ? "-CF"
      : design.has_preprint
        ? "WH"
        : "";
  // Garden + house both exist for the vast majority of canonical-AF designs.
  // Banner only when product_types explicitly includes it (rare).
  const out: VariantSku[] = [mk(`AFGF${body}${suffix}`, ""), mk(`AFHF${body}${suffix}`, "house")];
  const types = design.product_types || [];
  if (types.includes("garden-banner")) out.push(mk(`AFGB${body}${suffix}`, "banner"));
  return out;
}

const JF_ADMIN_SEARCH = "https://admin.shopify.com/store/justforfunflags/products?query=";

// Compute units sold per year of catalog age.
// Start clock = catalog_created_date (preferred) or first_sale_date.
// Floor at 30 days so newly-added designs don't divide by ~zero and explode.
function unitsPerYear(design: Design): number | null {
  if (design.units_total === 0) return 0;
  const start = design.catalog_created_date || design.first_sale_date;
  if (!start) return null;
  const days = Math.max(30, (Date.now() - Date.parse(start)) / 86400000);
  return design.units_total / (days / 365.25);
}

function formatRate(rate: number | null): string {
  if (rate === null) return "";
  if (rate < 1) return `${rate.toFixed(1)}/yr`;
  if (rate < 10) return `${rate.toFixed(1)}/yr`;
  return `${Math.round(rate)}/yr`;
}

export function DesignCard({
  design,
  monthRange,
  productType,
  onOpenDetail,
}: {
  design: Design;
  monthRange?: MonthRange | null;
  productType?: string;
  onOpenDetail?: (design: Design) => void;
}) {
  // Always show catalog Date Created — the design's actual creation date.
  // First-sale date is misleading (it's clamped to the start of our 3-year
  // sales export window for any design that was already selling pre-2023).
  const displayDate = design.catalog_created_date;
  const rate = unitsPerYear(design);
  const periodUnits = monthRange
    ? unitsInMonthRange(design, monthRange, productType)
    : null;
  // When a single variant is selected, the in-range number is variant-specific
  // and the lifetime suffix should match (lifetime per-variant total).
  const isVariantFiltered =
    productType === "garden" ||
    productType === "house" ||
    productType === "garden-banner";
  const variantLifetime = isVariantFiltered
    ? variantLifetimeUnits(design, productType!)
    : null;

  const variants = variantSkus(design);
  const gardenVariant = variants.find((v) => v.sku.startsWith("AFGF")) || variants[0];

  const imageContent = (
    <Image
      src={gardenVariant.imageUrl}
      alt={design.design_name || design.design_family}
      fill
      sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 200px"
      className="object-cover group-hover:opacity-90 transition-opacity"
      unoptimized
    />
  );

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Click image → open detail modal if the parent wired one in; otherwise
          fall back to opening the full-res image in a new tab. */}
      {onOpenDetail ? (
        <button
          type="button"
          onClick={() => onOpenDetail(design)}
          title="View sales history & detail"
          className="block aspect-square relative bg-zinc-50 group w-full cursor-pointer"
        >
          {imageContent}
        </button>
      ) : (
        <a
          href={gardenVariant.imageUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${gardenVariant.sku} image`}
          className="block aspect-square relative bg-zinc-50 group"
        >
          {imageContent}
        </a>
      )}
      <div className="p-3 space-y-0.5">
        <div className="text-sm leading-snug line-clamp-2 min-h-[2.5em]">
          {design.design_name || design.design_family}
        </div>
        <div className="text-[11px] font-mono text-muted-2">
          {variants.map((v, i) => (
            <span key={v.sku}>
              {i > 0 && <span className="mx-1 text-muted-2">/</span>}
              <a
                href={`${JF_ADMIN_SEARCH}${v.sku}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground hover:underline"
                title={`Open ${v.sku} in JF Shopify admin`}
              >
                {v.sku}
              </a>
            </span>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>
            {monthRange && periodUnits !== null ? (
              <>
                <span
                  className="font-medium text-foreground"
                  title={
                    isVariantFiltered
                      ? `${productType} units sold in ${rangeLabel(monthRange)}`
                      : `Units sold in ${rangeLabel(monthRange)} across all variants`
                  }
                >
                  {periodUnits.toLocaleString()}
                  {isVariantFiltered ? ` ${productType}` : ""} in {rangeLabel(monthRange)}
                </span>
                <span className="text-muted-2">
                  {" "}·{" "}
                  {(isVariantFiltered && variantLifetime !== null
                    ? variantLifetime
                    : design.units_total
                  ).toLocaleString()}{" "}
                  {isVariantFiltered ? `${productType} total` : "total"}
                </span>
              </>
            ) : (
              <>
                {design.units_total.toLocaleString()} units
                {rate !== null && rate > 0 && (
                  <span className="text-muted-2"> · {formatRate(rate)}</span>
                )}
              </>
            )}
          </span>
          <span title="Catalog Date Created">
            {formatMonthYear(displayDate)}
          </span>
        </div>
      </div>
    </div>
  );
}
