export type IncidentSeverity = "P1" | "P2" | "P3" | "P4";
export type IncidentStatus   = "open" | "investigating" | "mitigated" | "resolved" | "closed";

export interface IncidentUpdate {
  id: string;
  authorName: string;
  message: string;
  timestamp: string;
}

export interface Incident {
  id: string;
  incidentRef: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  affectedServices: string;
  detectedAt: string;
  resolvedAt?: string;
  closedAt?: string;
  incidentLead: string;
  incidentLeadUid: string;
  clientsAffected?: string;
  rootCause?: string;
  actionsTaken?: string;
  preventionPlan?: string;
  updates: IncidentUpdate[];
  linkedTickets?: string[];
  linkedChange?: string;
  createdAt: string;
}

export const INCIDENT_SEVERITY_STYLES: Record<IncidentSeverity, string> = {
  P1: "bg-red-600/20 text-red-400 border-red-600/40",
  P2: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  P3: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  P4: "bg-white/8 text-white/40 border-white/15",
};

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  P1: "P1 — Critical",
  P2: "P2 — Major",
  P3: "P3 — Minor",
  P4: "P4 — Low",
};

export const INCIDENT_STATUS_STYLES: Record<IncidentStatus, string> = {
  open:          "bg-red-500/15 text-red-400 border-red-500/30",
  investigating: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  mitigated:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  resolved:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  closed:        "bg-white/8 text-white/30 border-white/15",
};

export function generateIncidentRef(): string {
  return `INC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}
