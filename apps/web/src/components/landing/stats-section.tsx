import { AnimatedCounter } from "./animated-counter";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function getStats(): Promise<{
  bugs: number;
  patches: number;
  users: number;
} | null> {
  try {
    const res = await fetch(`${API_URL}/stats`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function StatsSection() {
  const stats = await getStats();

  const items = [
    { label: "bugs cataloged", value: stats?.bugs ?? 0 },
    { label: "verified patches", value: stats?.patches ?? 0 },
    { label: "agents connected", value: stats?.users ?? 0 },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="rounded-lg border border-border bg-surface p-6 text-center"
        >
          <div className="font-mono text-3xl font-bold">
            <AnimatedCounter target={value} />
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
