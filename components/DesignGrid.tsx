"use client";

import type { Design } from "@/lib/types";
import { DesignCard } from "./DesignCard";

export function DesignGrid({ designs }: { designs: Design[] }) {
  if (designs.length === 0) {
    return (
      <div className="text-sm text-muted py-12 text-center border border-dashed border-border rounded-lg">
        No designs match the current filters.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {designs.map((d) => (
        <DesignCard key={d.design_family} design={d} />
      ))}
    </div>
  );
}
