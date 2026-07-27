export function ScoreRing({ label, score }: { label: string; score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= 80 ? "#0f766e" : clamped >= 55 ? "#b7791f" : "#b42318";

  return (
    <div
      aria-label={`${label}: ${clamped} / 100`}
      className="grid size-32 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${color} ${clamped}%, #e5ece9 ${clamped}% 100%)`
      }}
    >
      <div className="grid size-24 place-items-center rounded-full bg-white shadow-sm">
        <div className="text-center">
          <div className="text-2xl font-bold" aria-hidden="true">{clamped} / 100</div>
          <div className="px-1 text-[0.65rem] font-semibold leading-3 text-[var(--muted)]" aria-hidden="true">{label}</div>
        </div>
      </div>
    </div>
  );
}
