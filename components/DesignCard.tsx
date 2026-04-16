"use client";

import Image from "next/image";
import type { Design } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonthYear(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Build every variant SKU we know exists for a design family. Garden first,
// then house, then banner — that's the natural reading order on the tile.
// Each entry has the SKU, a short label ("" for garden = default), and the
// full-res image URL (constructed from the SKU using the same pattern
// TeamDesk's `imgLocationFTP500` column uses).
interface VariantSku {
  sku: string;
  label: string;
  imageUrl: string;
}
function variantSkus(design: Design): VariantSku[] {
  const body = design.design_family.replace(/^AF/, "");
  const types = design.product_types || [];
  const mk = (sku: string, label: string): VariantSku => ({
    sku,
    label,
    imageUrl: `https://images.clownantics.com/CA_resize_500_500/${sku.toLowerCase()}.jpg`,
  });
  // Always show garden + house — both variants exist in the catalog for the
  // vast majority of designs, even when only one has recorded sales. Broken
  // images on the rare exception are an acceptable trade for completeness.
  // Banner only when product_types explicitly includes it (rare).
  const out: VariantSku[] = [mk(`AFGF${body}`, ""), mk(`AFHF${body}`, "house")];
  if (types.includes("garden-banner")) out.push(mk(`AFGB${body}`, "banner"));
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

export function DesignCard({ design }: { design: Design }) {
  // Real first-sale date wins; otherwise fall back to the catalog Date Created.
  // A "★" indicates "no sales yet — date is when the SKU was added to the catalog".
  const displayDate =
    design.first_sale_date || design.catalog_created_date;
  const isCatalogOnly =
    !design.first_sale_date && !!design.catalog_created_date;
  const rate = unitsPerYear(design);

  const variants = variantSkus(design);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Image strip — one panel per variant (garden / house / banner) */}
      <div className="flex bg-zinc-50">
        {variants.map((v) => (
          <a
            key={v.sku}
            href={v.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${v.sku}${v.label ? ` (${v.label})` : ""} image`}
            className="relative aspect-square flex-1 group"
          >
            <Image
              src={v.imageUrl}
              alt={`${design.design_name || design.design_family}${v.label ? ` — ${v.label}` : ""}`}
              fill
              sizes="(max-width: 768px) 25vw, (max-width: 1200px) 12vw, 100px"
              className="object-cover group-hover:opacity-90 transition-opacity"
              unoptimized
            />
            {v.label && (
              <span className="absolute bottom-1 left-1 px-1 py-0.5 text-[9px] uppercase tracking-wide bg-black/60 text-white rounded">
                {v.label}
              </span>
            )}
          </a>
        ))}
      </div>
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
              {v.label && <span className="text-muted-2"> {v.label}</span>}
            </span>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>
            {design.units_total.toLocaleString()} units
            {rate !== null && rate > 0 && (
              <span className="text-muted-2"> · {formatRate(rate)}</span>
            )}
          </span>
          <span
            title={isCatalogOnly ? "Catalog Date Created — no sales yet" : "First sale"}
            className={isCatalogOnly ? "italic text-muted-2" : ""}
          >
            {isCatalogOnly ? "★ " : ""}
            {formatMonthYear(displayDate)}
          </span>
        </div>
      </div>
    </div>
  );
}
