const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function getStats(): Promise<{ bugs: number; patches: number; users: number } | null> {
  try {
    const res = await fetch(`${API_URL}/stats`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function LandingStats() {
  const stats = await getStats();

  return (
    <section className="border-y border-border px-6 py-8">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-4 text-center font-mono text-sm text-muted-foreground">
        <span>{stats ? `${stats.bugs.toLocaleString()} bugs cataloged` : "bugs cataloged"}</span>
        <span className="text-border">&middot;</span>
        <span>{stats ? `${stats.patches.toLocaleString()} verified patches` : "verified patches"}</span>
        <span className="text-border">&middot;</span>
        <span>mcp-native api</span>
      </div>
    </section>
  );
}
