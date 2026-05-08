export type KBCategory =
  | "network" | "hardware" | "software" | "security" | "cloud"
  | "helpdesk" | "onboarding" | "policy" | "runbook" | "other";

export type KBStatus = "draft" | "published" | "archived";

export interface KBArticle {
  id: string;
  title: string;
  category: KBCategory;
  status: KBStatus;
  content: string;
  tags: string[];
  ticketTypeLink?: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  isPublic: boolean;
}

export const KB_CATEGORY_LABELS: Record<KBCategory, string> = {
  network:    "Network & Infrastructure",
  hardware:   "Hardware",
  software:   "Software",
  security:   "Security",
  cloud:      "Cloud Services",
  helpdesk:   "Helpdesk / Support",
  onboarding: "Onboarding",
  policy:     "Policies & Procedures",
  runbook:    "Runbooks",
  other:      "Other",
};

export const KB_CATEGORY_ICONS: Record<KBCategory, string> = {
  network:    "🌐",
  hardware:   "🖥️",
  software:   "💾",
  security:   "🔒",
  cloud:      "☁️",
  helpdesk:   "🎧",
  onboarding: "🚀",
  policy:     "📋",
  runbook:    "📖",
  other:      "📄",
};
