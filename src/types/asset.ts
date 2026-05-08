export type AssetCategory = "laptop" | "desktop" | "server" | "network" | "phone" | "printer" | "monitor" | "ups" | "software_license" | "other";
export type AssetStatus   = "available" | "assigned" | "in_repair" | "decommissioned" | "lost";
export type AssetCondition = "excellent" | "good" | "fair" | "poor";

export interface AssetAssignment {
  employeeUid:  string;
  employeeName: string;
  assignedAt:   string;
  returnedAt?:  string;
  notes?:       string;
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  serialNumber?: string;
  model?: string;
  brand?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  warrantyExpiry?: string;
  status: AssetStatus;
  condition: AssetCondition;
  location?: string;
  assignedTo?: string;
  assignedToUid?: string;
  assignedAt?: string;
  clientId?: string;
  clientName?: string;
  notes?: string;
  assignmentHistory: AssetAssignment[];
  createdAt: string;
  createdBy: string;
}

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  laptop:           "Laptop",
  desktop:          "Desktop PC",
  server:           "Server",
  network:          "Network Equipment",
  phone:            "Mobile Phone",
  printer:          "Printer / Scanner",
  monitor:          "Monitor",
  ups:              "UPS / Power",
  software_license: "Software License",
  other:            "Other",
};

export const ASSET_STATUS_STYLES: Record<AssetStatus, string> = {
  available:       "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  assigned:        "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_repair:       "bg-amber-500/15 text-amber-400 border-amber-500/30",
  decommissioned:  "bg-white/8 text-white/30 border-white/15",
  lost:            "bg-red-500/15 text-red-400 border-red-500/30",
};

export const ASSET_CONDITION_STYLES: Record<AssetCondition, string> = {
  excellent: "text-emerald-400",
  good:      "text-blue-400",
  fair:      "text-amber-400",
  poor:      "text-red-400",
};
