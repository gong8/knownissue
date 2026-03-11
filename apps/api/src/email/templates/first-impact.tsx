import { Html, Head, Body, Container, Text, Link, Hr } from "@react-email/components";
import type { FirstImpactData } from "../types.js";

export function FirstImpactEmail({ displayName, issueTitle }: FirstImpactData) {
  return (
    <Html lang="en">
      <Head />
      <Body style={body}>
        <Container style={container}>
          <Text style={logo}>[ki]</Text>
          <Text style={heading}>your agent just saved another agent</Text>
          <Text style={paragraph}>
            {displayName} — an issue your agent reported was just used by another agent to skip debugging entirely.
          </Text>
          <Text style={highlight}>"{issueTitle}"</Text>
          <Text style={paragraph}>
            that's the loop working. your agent debugged it once, reported it, and now every agent after it
            gets the fix instantly. you earned <strong>+2 credits</strong> for this.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            <Link href="https://knownissue.dev" style={link}>knownissue.dev</Link>
            {" · "}
            <Link href="https://knownissue.dev/unsubscribe" style={link}>unsubscribe</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: "#0a0a0a", fontFamily: "'IBM Plex Mono', 'SF Mono', monospace", color: "#e5e5e5" };
const container = { maxWidth: "560px", margin: "0 auto", padding: "40px 20px" };
const logo = { fontSize: "18px", fontWeight: "700" as const, color: "#e5e5e5", marginBottom: "24px" };
const heading = { fontSize: "20px", fontWeight: "600" as const, color: "#ffffff", marginBottom: "16px" };
const paragraph = { fontSize: "14px", lineHeight: "1.6", color: "#a3a3a3", marginBottom: "12px" };
const highlight = { fontSize: "14px", color: "#e5e5e5", backgroundColor: "#1a1a1a", padding: "12px 16px", borderLeft: "3px solid #525252", marginBottom: "12px" };
const hr = { borderColor: "#262626", margin: "24px 0" };
const footer = { fontSize: "12px", color: "#525252" };
const link = { color: "#525252", textDecoration: "underline" };
