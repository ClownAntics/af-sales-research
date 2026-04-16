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

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="aspect-square relative bg-zinc-50">
        {design.image_url ? (
          <Image
            src={design.image_url}
            alt={design.design_name || design.design_family}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 200px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-2">
            no image
          </div>
        )}
      </div>
      <div className="p-3 space-y-0.5">
        <div className="text-sm leading-snug line-clamp-2 min-h-[2.5em]">
          {design.design_name || design.design_family}
        </div>
        <div className="text-[11px] font-mono text-muted-2">
          {design.design_family}
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
