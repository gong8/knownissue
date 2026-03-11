import { Hono } from "hono";
import { prisma } from "@knownissue/db";
import type { AppEnv } from "../lib/types";

export const email = new Hono<AppEnv>();

// Token-less unsubscribe — uses userId in query param.
// Not sensitive because unsubscribing is a benign action.
email.get("/unsubscribe", async (c) => {
  const userId = c.req.query("uid");
  if (!userId) {
    return c.html("<html><body><p>Invalid unsubscribe link.</p></body></html>", 400);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { emailUnsubscribed: true },
  }).catch(() => {});

  return c.html(
    `<html>
      <body style="background:#0a0a0a;color:#e5e5e5;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
        <div style="text-align:center">
          <p style="font-size:18px;font-weight:700">[ki]</p>
          <p>you've been unsubscribed. no more emails from us.</p>
        </div>
      </body>
    </html>`
  );
});
