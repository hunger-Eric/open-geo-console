import type { FindingSeverity } from "@open-geo-console/geo-auditor";

const severityStyles: Record<FindingSeverity, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-slate-200 bg-slate-50 text-slate-700"
};

export function SeverityPill({ label, severity }: { label: string; severity: FindingSeverity }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold uppercase ${severityStyles[severity]}`}
    >
      {label}
    </span>
  );
}
