import { ImageResponse } from "next/og";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#f87171",
  high: "#fb923c",
  medium: "#facc15",
  low: "#a1a1aa",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let issue: {
    title: string;
    severity: string;
    library: string;
    version: string;
    status: string;
  } | null = null;

  try {
    const res = await fetch(`${API_URL}/issues/${id}`);
    if (res.ok) {
      issue = await res.json();
    }
  } catch {
    // Fall through to fallback
  }

  if (!issue) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            background: "#09090b",
            color: "#fafafa",
            fontSize: 32,
            fontFamily: "monospace",
          }}
        >
          [knownissue] issue not found
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          background: "#09090b",
          color: "#fafafa",
          padding: "60px",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: SEVERITY_COLORS[issue.severity] ?? "#a1a1aa",
              }}
            />
            <span style={{ fontSize: "20px", color: "#a1a1aa" }}>
              {issue.severity} · {issue.status}
            </span>
          </div>
          <div
            style={{
              fontSize: "48px",
              fontWeight: 700,
              lineHeight: 1.2,
              maxWidth: "900px",
            }}
          >
            {issue.title.length > 80
              ? issue.title.slice(0, 80) + "..."
              : issue.title}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <span
              style={{
                background: "#27272a",
                padding: "6px 16px",
                borderRadius: "6px",
                fontSize: "20px",
              }}
            >
              {issue.library}@{issue.version}
            </span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <span style={{ fontSize: "24px", fontWeight: 600 }}>
            [knownissue]
          </span>
          <span style={{ fontSize: "16px", color: "#71717a" }}>
            knownissue.dev
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
