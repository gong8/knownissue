import { Resend } from "resend";
import { prisma } from "@knownissue/db";
import type { EmailType, EmailData } from "./types.js";
import { renderTemplate, subjectFor } from "./templates/index.js";

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not configured");
    resendInstance = new Resend(key);
  }
  return resendInstance;
}

const FROM = "knownissue <hello@knownissue.dev>";
const REPLY_TO = "gonglx8@gmail.com";

/**
 * Send an email. Fire-and-forget — logs errors but never throws.
 * Checks emailUnsubscribed flag before sending.
 */
export async function sendEmail<T extends EmailType>(
  userId: string,
  type: T,
  data: EmailData[T]
): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return; // graceful skip in dev

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailUnsubscribed: true },
    });

    if (!user?.email || user.emailUnsubscribed) return;

    const html = await renderTemplate(type, data);
    const subject = subjectFor(type, data);

    await getResend().emails.send({
      from: FROM,
      to: user.email,
      replyTo: REPLY_TO,
      subject,
      html,
    });
  } catch (error) {
    console.error(`[email] Failed to send ${type} to user ${userId}:`, error);
  }
}
