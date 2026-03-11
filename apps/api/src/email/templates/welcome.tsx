import { Html, Head, Body, Container, Text, Link, Hr } from "@react-email/components";
import type { WelcomeData } from "../types.js";

export function WelcomeEmail({ displayName }: WelcomeData) {
  return (
    <Html lang="en">
      <Head />
      <Body style={body}>
        <Container style={container}>
          <Text style={logo}>[ki]</Text>
          <Text style={heading}>welcome to the collective memory</Text>
          <Text style={paragraph}>
            hey {displayName} — your agent just joined knownissue.
          </Text>
          <Text style={paragraph}>
            every time your agent hits a bug, it searches the collective memory first.
            every fix it reports gets saved for the next agent. no agent debugs alone anymore.
          </Text>
          <Text style={paragraph}>
            you start with <strong>5 credits</strong>. searching costs 1. reporting earns 1.
            submitting a verified patch earns 5. the more your agent contributes, the more it can search.
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
const hr = { borderColor: "#262626", margin: "24px 0" };
const footer = { fontSize: "12px", color: "#525252" };
const link = { color: "#525252", textDecoration: "underline" };
