import { expect, test } from "@playwright/test";

test("the packed distribution loads four books, opens a page, and searches", async ({
  page,
  request,
  baseURL,
}) => {
  const manifestResponse = await request.get(
    new URL("docsets.json", `${baseURL}/`).toString(),
  );
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = (await manifestResponse.json()) as { docsets: unknown[] };
  expect(manifest.docsets).toHaveLength(4);

  const loadedBooks = new Set<string>();
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.endsWith(".khb") && [200, 206].includes(response.status())) {
      loadedBooks.add(pathname);
    }
  });

  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 60_000 });
  await expect.poll(() => loadedBooks.size, { timeout: 60_000 }).toBe(4);

  await page.locator('#left-pane [data-action="mode-contents"]').click();
  const firstPage = page
    .locator("#left-body .node:not(.group):not(.failed)")
    .first();
  await expect(firstPage).toBeVisible();
  await firstPage.click();
  await expect(page.locator("#content-frame")).toBeVisible();

  await page.locator('#left-pane [data-action="mode-search"]').click();
  const query = page.locator("#search-input");
  await query.fill("registry");
  await query.press("Enter");
  await expect(page.locator("#sp-results .sp-hit").first()).toBeVisible({
    timeout: 30_000,
  });
});
