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
  // Monogram designs don't have a bare SKU — only per-letter SKUs (A..Z).
  // Use "A" as the canonical variant for both display and image URL.
  const mono = design.has_monogram ? "A" : "";
  const mk = (sku: string, label: string): VariantSku => ({
    sku,
    label,
    imageUrl: `https://images.clownantics.com/CA_resize_500_500/${sku.toLowerCase()}.jpg`,
  });
  // Always show garden + house — both variants exist in the catalog for the
  // vast majority of designs, even when only one has recorded sales. Broken
  // images on the rare exception are an acceptable trade for completeness.
  // Banner only when product_types explicitly includes it (rare).
  const out: VariantSku[] = [mk(`AFGF${body}${mono}`, ""), mk(`AFHF${body}${mono}`, "house")];
  if (types.includes("garden-banner")) out.push(mk(`AFGB${body}${mono}`, "banner"));
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
  // Always show catalog Date Created — the design's actual creation date.
  // First-sale date is misleading (it's clamped to the start of our 3-year
  // sales export window for any design that was already selling pre-2023).
  const displayDate = design.catalog_created_date;
  const rate = unitsPerYear(design);

  const variants = variantSkus(design);
  const gardenVariant = variants.find((v) => v.sku.startsWith("AFGF")) || variants[0];

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Single image — garden flag only. Other variants are still listed as
          clickable SKU links below. */}
      <a
        href={gardenVariant.imageUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${gardenVariant.sku} image`}
        className="block aspect-square relative bg-zinc-50 group"
      >
        <Image
          src={gardenVariant.imageUrl}
          alt={design.design_name || design.design_family}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 200px"
          className="object-cover group-hover:opacity-90 transition-opacity"
          unoptimized
        />
      </a>
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
            {design.units_total.toLocaleString()} units
            {rate !== null && rate > 0 && (
              <span className="text-muted-2"> · {formatRate(rate)}</span>
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
