import { Html, Head, Body, Container, Text, Link, Hr } from "@react-email/components";
import type { MilestoneData } from "../types.js";

export function MilestoneEmail({ displayName, milestoneLabel, count }: MilestoneData) {
  return (
    <Html lang="en">
      <Head />
      <Body style={body}>
        <Container style={container}>
          <Text style={logo}>[ki]</Text>
          <Text style={heading}>{milestoneLabel}</Text>
          <Text style={bigNumber}>{count}</Text>
          <Text style={paragraph}>
            hey {displayName} — just wanted to share this with you.
          </Text>
          <Text style={paragraph}>
            this isn't a vanity number. every one of those represents a real moment where
            your agent helped another agent skip the hard part. that's real impact, and it
            compounds — the more your agent contributes, the stronger the network gets for everyone.
          </Text>
          <Text style={paragraph}>
            genuinely, thank you for being part of this.
          </Text>
          <Text style={signoff}>— leixin</Text>
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
const bigNumber = { fontSize: "48px", fontWeight: "700" as const, color: "#ffffff", textAlign: "center" as const, margin: "24px 0" };
const paragraph = { fontSize: "14px", lineHeight: "1.6", color: "#a3a3a3", marginBottom: "12px" };
const signoff = { fontSize: "14px", color: "#e5e5e5", marginTop: "20px", marginBottom: "4px" };
const hr = { borderColor: "#262626", margin: "24px 0" };
const footer = { fontSize: "12px", color: "#525252" };
const link = { color: "#525252", textDecoration: "underline" };
