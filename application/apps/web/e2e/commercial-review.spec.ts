import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { clientPortalFixture, commercialFixture, packagePanel, signIn, signInClient } from "./commercial-fixture";

async function approve(page: Page) {
  const response = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/package-review") && r.request().method() === "POST");
  await packagePanel(page).getByRole("button", { name: "Approve", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  const review = await result.json();
  return review;
}

test("opens the actual panel and approves the current priced package", async ({ page }) => {
  const f = await commercialFixture();
  await signIn(page, f);
  await expect(packagePanel(page).getByText("Review status", { exact: true })).toBeVisible();
  await expect(packagePanel(page).getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
  const review = await approve(page);
  expect(review.bindingStatus).toBe("current");
  expect(review.readiness.clientReady).toBe(true);
  await expect(packagePanel(page)).toContainText("approved and client-ready");
});

test("approval updates the visible panel without a manual reload", async ({ page }) => {
  const f = await commercialFixture();
  await signIn(page, f);
  let navigations = 0;
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });
  expect((await approve(page)).readiness.clientReady).toBe(true);
  await expect(packagePanel(page)).toContainText("approved and client-ready");
  expect(navigations).toBe(0);
});

test("pricing edits preserve commercial fields, stale approval, and allow reapproval of the new version", async ({ page }) => {
  const f = await commercialFixture();
  await signIn(page, f);
  const firstApproval = await approve(page);
  expect(firstApproval.readiness.clientReady).toBe(true);
  const pageTimeOrigin = await page.evaluate(() => performance.timeOrigin);

  const amount = page.getByLabel("Amount for Improve performance");
  await expect(amount).toHaveValue("100.00");
  await expect(page.getByLabel("Quantity for Improve performance")).toHaveValue("3");
  await expect(page.getByLabel("Notes for Improve performance")).toHaveValue("Retain this line note");
  await expect(page.getByLabel("Proposal discount")).toHaveValue("5.00");
  await expect(page.getByLabel("Proposal valid until")).toHaveValue("2099-12-31");
  await expect(page.getByLabel("Commercial notes")).toHaveValue("Keep these proposal notes");
  await amount.fill("123.45");

  const saved = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/proposal-pricing") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save pricing" }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  const proposal = await response.json();
  expect(proposal.version).toBe(2);
  expect(proposal.review).toMatchObject({ decision: "pending", bindingStatus: "stale", currentBinding: { proposal: { version: 2 } } });
  expect(proposal.content.pricing).toMatchObject({ currency: "USD", discountMinor: 500, validUntil: "2099-12-31", commercialNotes: "Keep these proposal notes" });
  expect(proposal.content.pricing.items[0]).toMatchObject({ amountMinor: 12345, quantity: 3, adminNotes: "Retain this line note", pricingType: "one_time" });
  await expect(packagePanel(page)).toContainText("The reviewed versions changed");
  await expect(packagePanel(page)).not.toContainText("approved and client-ready");
  const latestApproval = await approve(page);
  expect(latestApproval.currentBinding.proposal.version).toBe(2);
  expect(latestApproval.readiness.clientReady).toBe(true);
  await expect(packagePanel(page)).toContainText("approved and client-ready");
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(pageTimeOrigin);
});

test("a stale pricing save returns a recoverable conflict and succeeds against the reloaded version", async ({ page }) => {
  const f = await commercialFixture();
  await signIn(page, f);
  await f.reviseProposal();
  await page.getByLabel("Amount for Improve performance").fill("125.00");
  const stale = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/proposal-pricing"));
  await page.getByRole("button", { name: "Save pricing" }).click();
  expect((await stale).status()).toBe(409);
  await expect(page.getByText("The proposal changed. Reload the current pricing before saving.", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Amount for Improve performance")).toHaveValue("110.00");
  await page.getByLabel("Amount for Improve performance").fill("125.00");
  const current = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/proposal-pricing"));
  await page.getByRole("button", { name: "Save pricing" }).click();
  const response = await current;
  expect(response.status()).toBe(200);
  expect((await response.json()).version).toBe(3);
});

test("a stale conflict clears a previously client-ready panel without reloading", async ({ page }) => {
  const f = await commercialFixture();
  await signIn(page, f);
  await approve(page);
  await expect(packagePanel(page)).toContainText("approved and client-ready");
  await f.reviseNarrative();
  const response = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/package-review"));
  await packagePanel(page).getByRole("button", { name: "Approve", exact: true }).click();
  expect((await response).status()).toBe(409);
  await expect(packagePanel(page)).toContainText("Reload the workspace and review the current versions");
  await expect(packagePanel(page)).not.toContainText("approved and client-ready");
});

test("narrative revision makes approval stale and permits re-review", async ({ page }) => {
  const f = await commercialFixture();
  await signIn(page, f);
  await approve(page);
  await expect(packagePanel(page)).toContainText("approved and client-ready");
  await f.reviseNarrative();
  await page.reload();
  await expect(packagePanel(page)).toContainText("The reviewed versions changed");
  await expect(packagePanel(page)).not.toContainText("approved and client-ready");
  const review = await approve(page);
  expect(review.currentBinding.narrative.version).toBe(2);
  expect(review.readiness.clientReady).toBe(true);
  await expect(packagePanel(page)).toContainText("approved and client-ready");
});

test("stale browser review receives a real recoverable 409, then succeeds after reload", async ({ page }) => {
  const f = await commercialFixture();
  await signIn(page, f);
  await expect(packagePanel(page).getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
  await f.reviseNarrative(); // keep the browser's precondition at v1
  const response = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/package-review"));
  await packagePanel(page).getByRole("button", { name: "Approve", exact: true }).click();
  expect((await response).status()).toBe(409);
  await expect(packagePanel(page)).toContainText("Reload the workspace and review the current versions");
  await expect(packagePanel(page).getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
  await page.reload();
  expect((await approve(page)).currentBinding.narrative.version).toBe(2);
});

for (const [label, expiry] of [["missing", null], ["expired", "2000-01-01"]] as const) {
  test(`${label} terms allow review but prevent client-ready status`, async ({ page }) => {
    const f = await commercialFixture("owner", expiry);
    await signIn(page, f);
    const review = await approve(page);
    expect(review.decision).toBe("approved");
    expect(review.readiness.clientReady).toBe(false);
    await expect(packagePanel(page)).toContainText("valid, non-expired commercial terms are required");
    await expect(packagePanel(page)).not.toContainText("approved and client-ready");
  });
}

test("team member cannot approve or convert through the exposed UI/API", async ({ page }) => {
  const f = await commercialFixture("team_member");
  await signIn(page, f);
  // The existing scanner page either denies the whole surface or exposes actions
  // whose server endpoint must deny the decision. Both preserve current UI policy.
  const deniedSurface = page.getByText("You don't have access to the Prospect Scanner", { exact: true });
  await expect(page.locator("body")).toContainText(/Review status|You don't have access to the Prospect Scanner/);
  if (await deniedSurface.isVisible()) {
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  } else {
    const response = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/package-review"));
    await packagePanel(page).getByRole("button", { name: "Approve", exact: true }).click();
    expect((await response).status()).toBe(403);
    await expect(packagePanel(page)).toContainText("You do not have permission");
  }
  const response = await page.request.post("/api/internal/runtime/package-review", { data: { runId: f.runId, action: "approve" } });
  expect(response.status()).toBe(403);
  const conversion = await page.request.post("/api/internal/runtime/package-conversion", { data: {
    runId: f.runId, idempotencyKey: `${f.runId}-team-conversion-key`,
  } });
  expect(conversion.status()).toBe(403);
});

test("converts a current approved package into one private canonical sales draft", async ({ page }) => {
  const f = await commercialFixture("owner", "2099-12-31", { client: true });
  await signIn(page, f);
  const review = await approve(page);
  expect(review.readiness.clientReady).toBe(true);
  await expect(page.getByRole("button", { name: "Convert to sales draft" })).toBeEnabled();
  const converted = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/package-conversion") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Convert to sales draft" }).click();
  const response = await converted;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({ runId: f.runId, clientId: f.clientId, replayed: false });
  await expect(page.getByText("Private sales draft created", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open sales proposal" })).toHaveAttribute("href", `/admin/proposals/${result.proposalId}`);

  const retry = await page.request.post("/api/internal/runtime/package-conversion", { data: {
    runId: f.runId, idempotencyKey: "browser-retry-idempotency-0001", clientId: "forged-client", proposalId: "forged-proposal",
  } });
  expect(retry.status()).toBe(200);
  expect(await retry.json()).toMatchObject({ proposalId: result.proposalId, replayed: true });
});

test("publishes a confirmed USD scanner proposal only to its onboarded client portal", async ({ page, browser }) => {
  const f = await commercialFixture("owner", "2099-12-31", { client: true });
  await signIn(page, f);
  expect((await approve(page)).readiness.clientReady).toBe(true);
  const converted = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/package-conversion") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Convert to sales draft" }).click();
  const result = await (await converted).json() as { proposalId: string };
  const client = await clientPortalFixture(f.clientId!);
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  try {
    await signInClient(clientPage, client);
    await expect(clientPage.getByText("No proposals yet", { exact: true })).toBeVisible();

    await page.goto(`/admin/proposals/${result.proposalId}`);
    await expect(page.getByText("Private scanner sales draft — not visible in the client portal.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review portal publication" })).toBeEnabled();
    await page.getByRole("button", { name: "Review portal publication" }).click();
    await expect(page.getByLabel("Confirm portal publication")).toContainText(client.email);
    await expect(page.getByLabel("Confirm portal publication")).toContainText("$295.00");
    await expect(page.getByLabel("Confirm portal publication")).toContainText("2099-12-31");
    await page.getByRole("button", { name: "Confirm and publish" }).click();
    await expect(page.getByText("Published to the client portal. No email was sent.", { exact: true })).toBeVisible();

    await clientPage.reload();
    await expect(clientPage.getByText("Local commercial acceptance fixture.", { exact: true })).toBeVisible();
    await expect(clientPage.getByText("Local acceptance evidence.", { exact: true })).toBeVisible();
    await expect(clientPage.locator("body")).not.toContainText(/PRIVATE|internal-report-id|internal-evidence-id/);
    await clientPage.getByRole("button", { name: "Accept proposal", exact: true }).click();
    await expect(clientPage.getByRole("group", { name: "Confirm proposal acceptance" })).toContainText("exact terms above");
    await clientPage.getByRole("button", { name: "Confirm acceptance", exact: true }).click();
    await expect(clientPage.getByText("Accepted. No contract, invoice, or payment was created.", { exact: true })).toBeVisible();
    await expect(clientPage.locator("body")).not.toContainText(/Create contract|Create deposit invoice|Send invoice/);
  } finally {
    await clientContext.close();
  }
});

test("client change request is recorded without accepting or superseding the published offer", async ({ page, browser }) => {
  const f = await commercialFixture("owner", "2099-12-31", { client: true });
  await signIn(page, f);
  expect((await approve(page)).readiness.clientReady).toBe(true);
  const converted = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/package-conversion") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Convert to sales draft" }).click();
  const result = await (await converted).json() as { proposalId: string };
  const client = await clientPortalFixture(f.clientId!);
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  try {
    await page.goto(`/admin/proposals/${result.proposalId}`);
    await page.getByRole("button", { name: "Review portal publication" }).click();
    await page.getByRole("button", { name: "Confirm and publish" }).click();
    await expect(page.getByText("Published to the client portal. No email was sent.", { exact: true })).toBeVisible();

    await signInClient(clientPage, client);
    await expect(clientPage.getByText("Local acceptance evidence.", { exact: true })).toBeVisible();
    await clientPage.getByRole("button", { name: "Request changes", exact: true }).click();
    await clientPage.getByLabel("Requested changes").fill("Please clarify the delivery timeline.");
    await clientPage.getByRole("button", { name: "Submit change request", exact: true }).click();
    await expect(clientPage.getByText("Changes requested — your team is revising this.", { exact: true })).toBeVisible();
    await expect(clientPage.getByText("Superseded by a newer proposal. This offer can no longer be accepted.", { exact: true })).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("Client requested changes — revise and resend.", { exact: true })).toBeVisible();
    await page.getByText("Proposal revision and client response history", { exact: true }).click();
    await expect(page.getByText("change_requested: Please clarify the delivery timeline.", { exact: true })).toBeVisible();
  } finally {
    await clientContext.close();
  }
});

test("commercial revision reuses intelligence, supersedes only on publication, and accepts only the current offer", async ({ page, browser }) => {
  const f = await commercialFixture("owner", "2099-12-31", { client: true });
  const service = createClient(process.env["SUPABASE_TEST_URL"]!, process.env["SUPABASE_TEST_SERVICE_KEY"]!, { auth: { persistSession: false } });
  await signIn(page, f);
  expect((await approve(page)).readiness.clientReady).toBe(true);
  const converted = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/package-conversion") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Convert to sales draft" }).click();
  const convertedResponse = await converted;
  expect(convertedResponse.status()).toBe(200);
  const original = await convertedResponse.json() as { proposalId: string };
  const client = await clientPortalFixture(f.clientId!);
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  try {
    await page.goto(`/admin/proposals/${original.proposalId}`);
    await page.getByRole("button", { name: "Review portal publication" }).click();
    await page.getByRole("button", { name: "Confirm and publish" }).click();
    await expect(page.getByText("Published to the client portal. No email was sent.", { exact: true })).toBeVisible();

    await signInClient(clientPage, client);
    await expect(clientPage.getByText("Local acceptance evidence.", { exact: true })).toBeVisible();
    await clientPage.getByRole("button", { name: "Request changes", exact: true }).click();
    await clientPage.getByLabel("Requested changes").fill("Please clarify the delivery timeline.");
    await clientPage.getByRole("button", { name: "Submit change request", exact: true }).click();
    await expect(clientPage.getByText("Changes requested — your team is revising this.", { exact: true })).toBeVisible();

    const artifactsBefore = await service.from("intelligence_artifacts").select("id").eq("run_id", f.runId);
    const narrativesBefore = await service.from("narrative_versions").select("id").eq("run_id", f.runId);
    expect(artifactsBefore.error).toBeNull();
    expect(narrativesBefore.error).toBeNull();
    await f.reviseProposal();
    await page.goto(`/admin/prospect-scanner/${f.runId}`);
    await expect(packagePanel(page)).toContainText("The reviewed versions changed");
    const revisionApproval = await approve(page);
    expect(revisionApproval.currentBinding.proposal.version).toBe(2);
    expect(revisionApproval.readiness.clientReady).toBe(true);

    await page.goto(`/admin/proposals/${original.proposalId}`);
    const prepareRevision = page.getByRole("button", { name: "Prepare private revision" });
    await expect(prepareRevision).toBeEnabled();
    const revisionNavigation = page.waitForURL((url) => url.pathname.startsWith("/admin/proposals/") && url.pathname !== `/admin/proposals/${original.proposalId}`);
    await prepareRevision.click();
    await revisionNavigation;
    const successorProposalId = page.url().split("/admin/proposals/")[1]!;
    expect(successorProposalId).not.toBe(original.proposalId);
    await expect(page.getByText("draft", { exact: true }).first()).toBeVisible();

    const reviewer = createClient(process.env["SUPABASE_TEST_URL"]!, process.env["SUPABASE_TEST_ANON_KEY"]!, { auth: { persistSession: false } });
    const login = await reviewer.auth.signInWithPassword({ email: f.email, password: f.password });
    expect(login.error).toBeNull();
    const [originalContext, revisionContext] = await Promise.all([
      reviewer.rpc("bl_scanner_sales_revision_context", { p_proposal_id: original.proposalId }),
      reviewer.rpc("bl_scanner_sales_revision_context", { p_proposal_id: successorProposalId }),
    ]);
    expect(originalContext.error).toBeNull();
    expect(revisionContext.error).toBeNull();
    expect(revisionContext.data).toMatchObject({ isScannerProposal: true, predecessorProposalId: original.proposalId,
      conversionId: originalContext.data?.conversionId, runId: f.runId });
    const [runRows, artifactsAfter, narrativesAfter] = await Promise.all([
      service.from("intelligence_runs").select("id").eq("id", f.runId),
      service.from("intelligence_artifacts").select("id").eq("run_id", f.runId),
      service.from("narrative_versions").select("id").eq("run_id", f.runId),
    ]);
    expect(runRows.data).toHaveLength(1);
    expect(artifactsAfter.data).toHaveLength(artifactsBefore.data!.length);
    expect(narrativesAfter.data).toHaveLength(narrativesBefore.data!.length);

    await clientPage.reload();
    await expect(clientPage.locator("body")).not.toContainText(successorProposalId);
    await expect(clientPage.getByText("Superseded by a newer proposal. This offer can no longer be accepted.", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Review portal publication" }).click();
    await expect(page.getByLabel("Confirm portal publication")).toContainText("$325.00");
    await page.getByRole("button", { name: "Confirm and publish" }).click();
    await expect(page.getByText("Published to the client portal. No email was sent.", { exact: true })).toBeVisible();

    await clientPage.reload();
    await expect(clientPage.getByText("Superseded by a newer proposal. This offer can no longer be accepted.", { exact: true })).toBeVisible();
    await expect(clientPage.getByRole("button", { name: "Accept proposal", exact: true })).toHaveCount(1);
    await expect(clientPage.getByRole("button", { name: "Request changes", exact: true })).toHaveCount(1);
    await expect(clientPage.locator("body")).not.toContainText(/PRIVATE|internal-report-id|internal-evidence-id/);
    await clientPage.getByRole("button", { name: "Accept proposal", exact: true }).click();
    await clientPage.getByRole("button", { name: "Confirm acceptance", exact: true }).click();
    await expect(clientPage.getByText("Accepted. No contract, invoice, or payment was created.", { exact: true })).toBeVisible();
    await expect(clientPage.locator("body")).not.toContainText(/Create contract|Create deposit invoice|Send invoice/);

    await page.reload();
    await expect(page.getByText("accepted", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare private revision" })).toHaveCount(0);
  } finally {
    await clientContext.close();
  }
});

test("non-USD converted proposals remain private and cannot be published", async ({ page }) => {
  const f = await commercialFixture("owner", "2099-12-31", { client: true, currency: "EUR" });
  await signIn(page, f);
  expect((await approve(page)).readiness.clientReady).toBe(true);
  const converted = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/package-conversion") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Convert to sales draft" }).click();
  const result = await (await converted).json() as { proposalId: string };
  await clientPortalFixture(f.clientId!);
  await page.goto(`/admin/proposals/${result.proposalId}`);
  await expect(page.getByText("Only USD proposals can be published until invoice currency support is available.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review portal publication" })).toHaveCount(0);
});

test("a source revision after conversion blocks publication until the package is reviewed and reconverted", async ({ page }) => {
  const f = await commercialFixture("owner", "2099-12-31", { client: true });
  await signIn(page, f);
  expect((await approve(page)).readiness.clientReady).toBe(true);
  const converted = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/package-conversion") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Convert to sales draft" }).click();
  const result = await (await converted).json() as { proposalId: string };
  await clientPortalFixture(f.clientId!);
  await f.reviseNarrative();
  await page.goto(`/admin/proposals/${result.proposalId}`);
  await expect(page.getByText("The approved source versions changed. Re-review and reconvert the package.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review portal publication" })).toHaveCount(0);
});

test("concurrent conversion retries return the same canonical proposal", async ({ page }) => {
  const f = await commercialFixture("owner", "2099-12-31", { client: true });
  await signIn(page, f);
  expect((await approve(page)).readiness.clientReady).toBe(true);

  // Exercise the database uniqueness + run lock with genuinely overlapping
  // requests and distinct retry keys. The RPC resolves one winner to both.
  const [left, right] = await Promise.all([
    page.request.post("/api/internal/runtime/package-conversion", { data: {
      runId: f.runId, idempotencyKey: `${f.runId}-conversion-left-0001`,
    } }),
    page.request.post("/api/internal/runtime/package-conversion", { data: {
      runId: f.runId, idempotencyKey: `${f.runId}-conversion-right-0001`,
    } }),
  ]);
  const [a, b] = await Promise.all([left.json(), right.json()]);
  expect([left.status(), right.status()], JSON.stringify([a, b])).toEqual([200, 200]);
  expect(a.proposalId).toBe(b.proposalId);
  expect([a.replayed, b.replayed].filter(Boolean)).toHaveLength(1);

  await page.reload();
  await expect(page.getByText("Private sales draft created", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open sales proposal" })).toHaveAttribute("href", `/admin/proposals/${a.proposalId}`);
});

test("expired package cannot be converted even after review approval", async ({ page }) => {
  const f = await commercialFixture("owner", "2000-01-01", { client: true });
  await signIn(page, f);
  const review = await approve(page);
  expect(review.readiness.clientReady).toBe(false);
  await expect(page.getByRole("button", { name: "Convert to sales draft" })).toBeDisabled();
  await expect(page.locator("body")).toContainText("valid, non-expired commercial terms are required");
});

test("client portal cannot read the private converted draft", async ({ page, browser }) => {
  const f = await commercialFixture("owner", "2099-12-31", { client: true });
  await signIn(page, f);
  expect((await approve(page)).readiness.clientReady).toBe(true);
  const converted = page.waitForResponse((r) => r.url().endsWith("/api/internal/runtime/package-conversion") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Convert to sales draft" }).click();
  const response = await converted;
  expect(response.status()).toBe(200);
  const result = await response.json();

  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await signInClient(clientPage, await clientPortalFixture(f.clientId!));
  await expect(clientPage.getByText("No proposals yet", { exact: true })).toBeVisible();
  await expect(clientPage.locator("body")).not.toContainText(result.proposalId);
  await expect(clientPage.locator("body")).not.toContainText("Private sales draft created");
  await clientContext.close();
});
