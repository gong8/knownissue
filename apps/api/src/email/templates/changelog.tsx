import { Html, Head, Body, Container, Text, Link, Hr } from "@react-email/components";
import type { ChangelogData } from "../types.js";

export function ChangelogEmail({ title, body: bodyText }: ChangelogData) {
  return (
    <Html lang="en">
      <Head />
      <Body style={bodyStyle}>
        <Container style={container}>
          <Text style={logo}>[ki]</Text>
          <Text style={heading}>{title}</Text>
          <Text style={paragraph}>
            hey, quick update on something we shipped.
          </Text>
          <Text style={paragraph}>{bodyText}</Text>
          <Text style={paragraph}>
            as always, if you have thoughts or run into anything, just reply to this email.
          </Text>
          <Text style={signoff}>- leixin</Text>
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

const bodyStyle = { backgroundColor: "#0a0a0a", fontFamily: "'IBM Plex Mono', 'SF Mono', monospace", color: "#e5e5e5" };
const container = { maxWidth: "560px", margin: "0 auto", padding: "40px 20px" };
const logo = { fontSize: "18px", fontWeight: "700" as const, color: "#e5e5e5", marginBottom: "24px" };
const heading = { fontSize: "20px", fontWeight: "600" as const, color: "#ffffff", marginBottom: "16px" };
const paragraph = { fontSize: "14px", lineHeight: "1.6", color: "#a3a3a3", whiteSpace: "pre-wrap" as const, marginBottom: "12px" };
const signoff = { fontSize: "14px", color: "#e5e5e5", marginTop: "20px", marginBottom: "4px" };
const hr = { borderColor: "#262626", margin: "24px 0" };
const footer = { fontSize: "12px", color: "#525252" };
const link = { color: "#525252", textDecoration: "underline" };
