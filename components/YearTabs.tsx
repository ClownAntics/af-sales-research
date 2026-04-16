"use client";

const YEARS = ["all", "2023", "2024", "2025", "2026"] as const;

export function YearTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (year: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-border">
      {YEARS.map((y) => {
        const active = value === y;
        return (
          <button
            key={y}
            onClick={() => onChange(y)}
            className={[
              "px-4 py-2 text-sm transition-colors -mb-px border-b-2",
              active
                ? "border-foreground text-foreground font-medium"
                : "border-transparent text-muted hover:text-foreground",
            ].join(" ")}
          >
            {y === "all" ? "All" : y}
          </button>
        );
      })}
    </div>
  );
}
