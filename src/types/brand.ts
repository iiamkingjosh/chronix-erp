/* ── Brand Asset Library ── */
export type AssetFileType = "image" | "video" | "document" | "font" | "other";

export interface BrandAsset {
  id: string;
  name: string;
  fileType: AssetFileType;
  url: string;
  description?: string;
  tags: string[];
  version: string;
  uploadedBy: string;
  createdAt: string;
}

/* ── Content Calendar ── */
export type Platform     = "instagram" | "linkedin" | "twitter" | "facebook" | "tiktok" | "blog" | "email" | "other";
export type PostStatus   = "idea" | "draft" | "scheduled" | "published" | "cancelled";

export interface ContentPost {
  id: string;
  title: string;
  platform: Platform;
  status: PostStatus;
  scheduledDate: string;
  caption?: string;
  assetIds?: string[];
  linkedCampaign?: string;
  assignedTo?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

/* ── Campaign Management ── */
export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "cancelled";

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  startDate: string;
  endDate?: string;
  budget?: number;
  targetAudience?: string;
  channels: Platform[];
  leadsGenerated?: number;
  conversions?: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

/* ── Email Marketing ── */
export type EmailCampaignStatus = "draft" | "scheduled" | "sent" | "cancelled";

export interface EmailCampaign {
  id: string;
  subject: string;
  preheader?: string;
  status: EmailCampaignStatus;
  targetSegment: "all_clients" | "all_leads" | "custom";
  customEmails?: string;
  scheduledAt?: string;
  sentAt?: string;
  sentCount?: number;
  htmlContent: string;
  createdBy: string;
  createdAt: string;
}

/* ── Shared styles ── */
export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram", linkedin: "LinkedIn", twitter: "X / Twitter",
  facebook: "Facebook", tiktok: "TikTok", blog: "Blog", email: "Email", other: "Other",
};

export const POST_STATUS_STYLES: Record<PostStatus, string> = {
  idea:      "bg-white/8 text-white/40 border-white/15",
  draft:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  scheduled: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  published: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-white/8 text-white/25 border-white/10",
};

export const CAMPAIGN_STATUS_STYLES: Record<CampaignStatus, string> = {
  draft:     "bg-white/8 text-white/40 border-white/15",
  active:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  paused:    "bg-amber-500/15 text-amber-400 border-amber-500/30",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  cancelled: "bg-white/8 text-white/25 border-white/10",
};
