import { Hono } from "hono";

const auth = new Hono();

auth.get("/health", (c) => {
  return c.json({ status: "ok" });
});

export { auth };
