import { Html, Head, Body, Container, Text, Link, Hr, Section, Row, Column } from "@react-email/components";
import type { PurchaseReceiptData } from "../types.js";

export function PurchaseReceiptEmail({ displayName, credits, amountCents, newBalance, date }: PurchaseReceiptData) {
  const amount = `$${(amountCents / 100).toFixed(2)}`;

  return (
    <Html lang="en">
      <Head />
      <Body style={body}>
        <Container style={container}>
          <Text style={logo}>[ki]</Text>
          <Text style={heading}>payment receipt</Text>
          <Text style={paragraph}>
            hey {displayName}, confirming your credit purchase went through.
          </Text>
          <Section style={receiptBox}>
            <Row>
              <Column><Text style={receiptLabel}>credits</Text></Column>
              <Column><Text style={receiptValue}>+{credits}</Text></Column>
            </Row>
            <Row>
              <Column><Text style={receiptLabel}>amount</Text></Column>
              <Column><Text style={receiptValue}>{amount} USD</Text></Column>
            </Row>
            <Row>
              <Column><Text style={receiptLabel}>new balance</Text></Column>
              <Column><Text style={receiptValue}>{newBalance} credits</Text></Column>
            </Row>
            <Row>
              <Column><Text style={receiptLabel}>date</Text></Column>
              <Column><Text style={receiptValue}>{date}</Text></Column>
            </Row>
          </Section>
          <Text style={paragraph}>
            your agent's credits are ready to use immediately. if anything looks
            wrong, just reply to this email.
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

const body = { backgroundColor: "#0a0a0a", fontFamily: "'IBM Plex Mono', 'SF Mono', monospace", color: "#e5e5e5" };
const container = { maxWidth: "560px", margin: "0 auto", padding: "40px 20px" };
const logo = { fontSize: "18px", fontWeight: "700" as const, color: "#e5e5e5", marginBottom: "24px" };
const heading = { fontSize: "20px", fontWeight: "600" as const, color: "#ffffff", marginBottom: "16px" };
const paragraph = { fontSize: "14px", lineHeight: "1.6", color: "#a3a3a3", marginBottom: "12px" };
const receiptBox = { backgroundColor: "#141414", border: "1px solid #262626", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const receiptLabel = { fontSize: "12px", color: "#525252", textTransform: "uppercase" as const, letterSpacing: "0.05em", margin: "6px 0" };
const receiptValue = { fontSize: "14px", color: "#e5e5e5", textAlign: "right" as const, margin: "6px 0" };
const signoff = { fontSize: "14px", color: "#e5e5e5", marginTop: "20px", marginBottom: "4px" };
const hr = { borderColor: "#262626", margin: "24px 0" };
const footer = { fontSize: "12px", color: "#525252" };
const link = { color: "#525252", textDecoration: "underline" };
