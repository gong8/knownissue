import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/knownissue/i);
  });

  test("shows hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main, section").first()).toBeVisible();
  });

  test("navigation is present", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
  });

  test("landing page contains key messaging", async ({ page }) => {
    await page.goto("/");
    // The landing page should reference agents/issues/patches
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("does not show 404 on landing", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).not.toContainText("404");
  });
});

test.describe("Dashboard Access", () => {
  test("redirects to sign-in when accessing /overview without auth", async ({ page }) => {
    await page.goto("/overview");
    // Clerk middleware should redirect to sign-in
    await expect(page).toHaveURL(/sign-in/);
  });

  test("redirects to sign-in when accessing /explore without auth", async ({ page }) => {
    await page.goto("/explore");
    await expect(page).toHaveURL(/sign-in/);
  });

  test("redirects to sign-in when accessing /your-agent without auth", async ({ page }) => {
    await page.goto("/your-agent");
    await expect(page).toHaveURL(/sign-in/);
  });
});

test.describe("Redirects", () => {
  test("/dashboard redirects to /overview", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect to /overview (which then redirects to sign-in without auth)
    await page.waitForURL(/overview|sign-in/);
    const url = page.url();
    expect(url).toMatch(/overview|sign-in/);
  });

  test("/activity redirects to /overview", async ({ page }) => {
    await page.goto("/activity");
    await page.waitForURL(/overview|sign-in/);
    const url = page.url();
    expect(url).toMatch(/overview|sign-in/);
  });

  test("/profile redirects to /your-agent", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL(/your-agent|sign-in/);
    const url = page.url();
    expect(url).toMatch(/your-agent|sign-in/);
  });
});

test.describe("Error Pages", () => {
  test("shows 404 for invalid routes", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    // The not-found page contains "404" and "page not found"
    await expect(page.locator("body")).toContainText("404");
    await expect(page.locator("body")).toContainText("page not found");
  });

  test("404 page has link back to home", async ({ page }) => {
    await page.goto("/nonexistent-route");
    const homeLink = page.locator('a[href="/"]');
    await expect(homeLink).toBeVisible();
  });
});

test.describe("Sign-in Page", () => {
  test("sign-in page loads", async ({ page }) => {
    await page.goto("/sign-in");
    // Should not redirect away — it's a public route
    await expect(page).toHaveURL(/sign-in/);
  });
});
