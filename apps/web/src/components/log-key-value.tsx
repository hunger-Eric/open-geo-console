export function LogKeyValue({
  label,
  mono,
  value
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase text-[var(--muted)]">{label}</dt>
      <dd className={`mt-1 break-words ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
