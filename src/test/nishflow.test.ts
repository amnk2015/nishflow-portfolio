import { describe, it, expect } from "vitest";
import { PACKAGES, PROFESSIONS, allowsAttachments, packagePrice, stepIndex } from "@/lib/nishflow";

describe("nishflow rules", () => {
  it("Basic Portfolio costs LKR 2,999", () => expect(PACKAGES["Basic Portfolio"]).toBe(2999));
  it("Premium Interactive costs LKR 4,999", () => expect(PACKAGES["Premium Interactive"]).toBe(4999));
  it("packagePrice gives the LKR price of each package", () => { expect(packagePrice("Basic Portfolio")).toBe(2999); expect(packagePrice("Premium Interactive")).toBe(4999); });
  it("packagePrice returns 0 for an unknown package", () => expect(packagePrice("Mystery Pack")).toBe(0));
  it("approved payment moves to step 3", () => expect(stepIndex("In Progress")).toBe(2));
  it("slip upload moves to verification step", () => expect(stepIndex("Pending Payment Approval")).toBe(1));
  it("only Premium Interactive allows custom attachments", () => { expect(allowsAttachments("Premium Interactive")).toBe(true); expect(allowsAttachments("Basic Portfolio")).toBe(false); });
  it("industry list includes Other", () => expect(PROFESSIONS).toContain("Other"));
});

import { canRequestRevision } from "@/lib/nishflow";
describe("revisions", () => {
  it("allows a revision while in progress with rounds left", () => expect(canRequestRevision("In Progress", 2, "Idle")).toBe(true));
  it("blocks once 3 revisions are used", () => expect(canRequestRevision("Completed", 3, "Idle")).toBe(false));
  it("blocks before payment is approved", () => expect(canRequestRevision("Pending Payment Approval", 0, "Idle")).toBe(false));
});
