export const PACKAGES = {
  "Basic Portfolio": 2999,
  "Premium Interactive": 4999,
} as const;
export type PackageName = keyof typeof PACKAGES;

/** Price in LKR for a package name; 0 for anything unknown. */
export function packagePrice(pkg: string) {
  return PACKAGES[pkg as PackageName] ?? 0;
}

export const PROFESSIONS = [
  "Software Engineering / IT",
  "Design / Creative",
  "Management / Consulting",
  "Marketing / Sales",
  "Finance / Accounting",
  "Healthcare / Medical",
  "Education / Teaching",
  "Engineering (Civil / Mechanical / Electrical)",
  "Law / Legal",
  "Hospitality / Tourism",
  "Student / Graduate",
  "Freelancer / Entrepreneur",
  "Other",
] as const;

export const PACKAGE_FEATURES: Record<PackageName, string[]> = {
  "Basic Portfolio": [
    "Single-page responsive portfolio",
    "About, skills, experience & contact sections",
    "Content built from your LinkedIn profile",
    "Mobile-friendly design",
    "Free hosting link",
    "1 revision round",
  ],
  "Premium Interactive": [
    "Everything in Basic Portfolio",
    "Interactive animations & custom design",
    "Projects / case-study gallery",
    "Upload your own photos, CV & documents",
    "Downloadable CV button",
    "3 revision rounds",
  ],
};

/** Custom photo & document attachments are a Premium Interactive perk only. */
export function allowsAttachments(pkg: string) {
  return pkg === "Premium Interactive";
}

export const BANK = {
  bank: "Commercial Bank of Ceylon",
  accountName: "A M N Kumari",
  branch: "Kandy Super Branch",
  accountNumber: "100752382870",
};

export const STEPS = [
  "Details Received & Pending Slip Upload",
  "Payment Verification Pending",
  "Portfolio Architecture In Progress",
  "Completed & Shipped",
] as const;

const STATUS_INDEX: Record<string, number> = {
  "Details Received": 0,
  "Pending Payment Approval": 1,
  "In Progress": 2,
  Completed: 3,
};

/** Index of the currently active step; Completed counts all steps done. */
export function stepIndex(status: string) {
  return STATUS_INDEX[status] ?? 0;
}

export function formatLKR(n: number) {
  return `LKR ${n.toLocaleString("en-US")}`;
}

export const MAX_REVISIONS = 3;
export function canRequestRevision(orderStatus: string, used: number, revisionStatus: string) {
  return (orderStatus === "In Progress" || orderStatus === "Completed") && used < MAX_REVISIONS && revisionStatus !== "Requested";
}
