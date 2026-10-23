import { describe, expect, it } from "vitest";
import type { CommercialReviewBinding } from "@brightloop/schema";
import { readPackageReviewUpdate, resolvePackageReviewView, type PackageReviewUpdate, type ProspectPackageView } from "./prospect-scanner";

const ref = (id: string) => ({ id, version: 1, checksum: id });
const binding: CommercialReviewBinding = { schemaVersion: 1, proposal: ref("p"), narrative: ref("n"), report: ref("r"), competitor: null, coreProposal: null };
const source = (): ProspectPackageView => ({ state: "ready_for_review", stateLabel: "Ready for review", badge: "in_review", reason: "Awaiting review",
  components: [], reviewDecision: "pending", reviewBinding: binding, canReview: true, pricingRequired: false, clientReady: false });
const approved = (): PackageReviewUpdate => ({ decision: "approved", bindingStatus: "current", currentBinding: binding,
  readiness: { state: "approved", reason: "Approved and client-ready", componentsReady: true, clientReady: true } });

describe("authoritative review completion state", () => {
  it("keeps the server view before a response exists", () => {
    const pkg = source();
    expect(resolvePackageReviewView(pkg, null)).toBe(pkg);
    expect(pkg.clientReady).toBe(false);
  });
  it("projects a validated current approval onto the matching visible versions", () => {
    const pkg = source();
    const review = readPackageReviewUpdate(approved());
    expect(resolvePackageReviewView(pkg, { source: pkg, review })).toMatchObject({ stateLabel: "Client ready", reviewDecision: "approved", clientReady: true });
    expect(pkg.state).toBe("ready_for_review"); // never mutate server props
  });
  it.each(["expired terms", "missing terms", "pricing incomplete", "commercial failure"])("preserves server denial of readiness: %s", (reason) => {
    const pkg = source();
    const review = approved();
    review.readiness = { ...review.readiness, clientReady: false, reason };
    expect(resolvePackageReviewView(pkg, { source: pkg, review })).toMatchObject({ clientReady: false, reason });
  });
  it.each(["rejected", "revision_requested"] as const)("renders the server's %s decision", (decision) => {
    const pkg = source();
    const review = approved();
    review.decision = decision;
    review.readiness = { ...review.readiness, state: decision, clientReady: false };
    expect(resolvePackageReviewView(pkg, { source: pkg, review })).toMatchObject({ state: decision, reviewDecision: decision, clientReady: false });
  });
  it("fails closed if a revision won between review persistence and response read", () => {
    const pkg = source();
    const review = approved();
    review.currentBinding = { ...binding, narrative: { ...binding.narrative, id: "n2", version: 2 } };
    expect(resolvePackageReviewView(pkg, { source: pkg, review })).toMatchObject({ state: "blocked", canReview: false, clientReady: false, reviewBinding: null });
  });
  it("an authoritative conflict clears a previous client-ready completion", () => {
    const pkg = { ...source(), state: "approved" as const, reviewDecision: "approved" as const, clientReady: true };
    expect(resolvePackageReviewView(pkg, { source: pkg, review: null })).toMatchObject({ state: "blocked", reviewDecision: "pending", clientReady: false });
  });
  it("new server props supersede a completion snapshot, including expiry or revision", () => {
    const old = source();
    const latest = { ...old, reason: "New version requires review", reviewBinding: { ...binding, proposal: { ...binding.proposal, version: 2 } } };
    expect(resolvePackageReviewView(latest, { source: old, review: approved() })).toBe(latest);
  });
  it.each([null, {}, { ...approved(), currentBinding: { forged: true } }, { ...approved(), decision: "pending" }])("rejects malformed or contradictory successful responses", (body) => {
    expect(() => readPackageReviewUpdate(body)).toThrow("Invalid review response");
  });
});
