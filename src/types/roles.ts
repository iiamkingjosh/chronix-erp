export const ROLES = {
  CEO:               "CEO",
  CFO:               "CFO",
  SYSTEM_ADMIN:      "System Admin",
  BRAND_LEAD:        "Brand Lead",
  SOCIAL_MEDIA_LEAD: "Social Media Lead",
  HR:                "HR",
  STAFF:             "Staff",
  CLIENT:            "Client",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export interface ChronixUser {
  uid: string;
  email: string;
  displayName: string | null;
  role: Role;
  department?: string;
  photoURL?: string | null;
  createdAt: string;
  lastLoginAt: string;
}

/* ── Legacy / alternative role name aliases ─────────────────
   Maps any non-canonical string stored in Firestore to the
   nearest canonical Role.  Extend this list when new aliases
   are discovered in production data.                         */
export const ROLE_ALIASES: Record<string, Role> = {
  "Admin":        ROLES.SYSTEM_ADMIN,
  "Super Admin":  ROLES.SYSTEM_ADMIN,
  "Manager":      ROLES.CEO,
  "Finance":      ROLES.CFO,
  "Accountant":   ROLES.CFO,
  "Support":      ROLES.STAFF,
  "Employee":     ROLES.STAFF,
  "User":         ROLES.STAFF,
};

/** Resolve a raw role string (possibly legacy) to a canonical Role.
 *  Falls back to ROLES.STAFF so the system never fully breaks. */
export function resolveRole(raw: string): Role {
  if ((Object.values(ROLES) as string[]).includes(raw)) return raw as Role;
  return ROLE_ALIASES[raw] ?? ROLES.STAFF;
}

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  /* ── CEO — executive visibility only (no operational manage:* rights)
      Uses view:all which expands only to view:* checks — see hasPermission(). */
  [ROLES.CEO]: [
    "view:all",
    "view:analytics",    "view:notifications",
    "view:reports",      "view:subscriptions",
    "view:tax",          "view:settings",
  ],

  /* ── CFO ─────────────────────────────────────────────── */
  [ROLES.CFO]: [
    "view:finance",       "view:reports",       "manage:finance",
    "view:staff",         "view:tickets",       "manage:tickets",
    "view:crm",           "view:projects",      "view:procurement",
    "view:hr",            "view:subscriptions",
    "manage:subscriptions",
    "view:analytics",     "view:notifications",
    "view:tax",           "manage:tax",
  ],

  /* ── System Admin — full platform access ─────────────── */
  [ROLES.SYSTEM_ADMIN]: [
    "view:all",
    "manage:staff",       "manage:settings",    "manage:hr",
    "view:finance",       "manage:tickets",     "manage:crm",
    "manage:projects",    "manage:procurement",
    "manage:subscriptions",
    "view:analytics",     "view:notifications",
    "view:tax",
  ],

  /* ── Brand Lead ──────────────────────────────────────── */
  [ROLES.BRAND_LEAD]: [
    "view:brand",         "manage:brand",       "view:reports",
    "view:staff",         "view:tickets",       "view:crm",
    "manage:crm",         "manage:projects",    "view:projects",
    "view:analytics",     "view:notifications",
  ],

  /* ── Social Media Lead ───────────────────────────────── */
  [ROLES.SOCIAL_MEDIA_LEAD]: [
    "view:social",        "manage:social",      "view:brand",
    "view:reports",       "view:tickets",       "view:crm",
    "manage:crm",         "view:projects",
    "view:analytics",     "view:notifications",
  ],

  /* ── HR ──────────────────────────────────────────────── */
  [ROLES.HR]: [
    "view:staff",         "manage:hr",          "view:reports",
    "view:tickets",       "view:crm",           "view:projects",
    "view:hr",
    "view:analytics",     "view:notifications",
    "view:tax",           "view:paye",
  ],

  /* ── Staff ───────────────────────────────────────────── */
  [ROLES.STAFF]: [
    "view:own",           "view:announcements",
    "view:tickets",       "view:crm",           "view:projects",
    "view:hr",            "view:notifications",
  ],

  /* ── Client — portal only ────────────────────────────── */
  [ROLES.CLIENT]: [
    "view:portal",
  ],
};

/**
 * Check if a role (canonical or legacy string) has a given permission.
 * Accepts raw strings so legacy Firestore roles like "Admin" work correctly.
 */
export function hasPermission(rawRole: string, permission: string): boolean {
  const role  = resolveRole(rawRole);
  const perms = ROLE_PERMISSIONS[role];
  if (!perms?.length) return false;
  if (perms.includes(permission)) return true;
  /* view:all grants every view:* gate only — never manage:* */
  if (perms.includes("view:all") && permission.startsWith("view:")) return true;
  return false;
}

/** CFO + System Admin may delete unpaid invoices (Firestore rules should match). */
export function canDeleteUnpaidInvoice(rawRole: string): boolean {
  const r = resolveRole(rawRole);
  return r === ROLES.CFO || r === ROLES.SYSTEM_ADMIN;
}

/** Where each role lands after login */
export const ROLE_REDIRECTS: Record<Role, string> = {
  [ROLES.CEO]:               "/dashboard",
  [ROLES.CFO]:               "/dashboard/finance",
  [ROLES.SYSTEM_ADMIN]:      "/dashboard",
  [ROLES.BRAND_LEAD]:        "/dashboard/crm",
  [ROLES.SOCIAL_MEDIA_LEAD]: "/dashboard/crm",
  [ROLES.HR]:                "/dashboard/hr",
  [ROLES.STAFF]:             "/dashboard",
  [ROLES.CLIENT]:            "/portal",
};

export const ROLE_COLORS: Record<Role, string> = {
  [ROLES.CEO]:               "bg-purple-900/30 text-purple-300 border-purple-700",
  [ROLES.CFO]:               "bg-emerald-900/30 text-emerald-300 border-emerald-700",
  [ROLES.SYSTEM_ADMIN]:      "bg-blue-900/30 text-blue-300 border-blue-700",
  [ROLES.BRAND_LEAD]:        "bg-orange-900/30 text-orange-300 border-orange-700",
  [ROLES.SOCIAL_MEDIA_LEAD]: "bg-pink-900/30 text-pink-300 border-pink-700",
  [ROLES.HR]:                "bg-teal-900/30 text-teal-300 border-teal-700",
  [ROLES.STAFF]:             "bg-slate-700/30 text-slate-300 border-slate-600",
  [ROLES.CLIENT]:            "bg-secondary/20 text-secondary border-secondary/40",
};
