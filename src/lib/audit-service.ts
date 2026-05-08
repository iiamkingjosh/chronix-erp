import {
  collection, addDoc, getDocs, query, orderBy, limit, where,
} from "firebase/firestore";
import { db } from "./firebase";

export type AuditAction =
  | "create" | "update" | "delete" | "approve" | "reject"
  | "login" | "logout" | "assign" | "resolve" | "export";

export type AuditModule =
  | "invoices" | "expenses" | "leave" | "disciplinary" | "assets"
  | "time" | "tickets" | "projects" | "crm" | "hr" | "procurement"
  | "subscriptions" | "knowledge" | "incidents" | "changes" | "users";

export interface AuditLog {
  id: string;
  actorUid:   string;
  actorName:  string;
  actorRole:  string;
  action:     AuditAction;
  module:     AuditModule;
  entityId?:  string;
  entityRef?: string;
  details?:   string;
  ipAddress?: string;
  timestamp:  string;
}

const COL = "audit_logs";

export async function logAuditEvent(data: Omit<AuditLog, "id">): Promise<void> {
  try {
    await addDoc(collection(db, COL), data);
  } catch {
    /* Non-blocking — audit failures must not crash the app */
  }
}

export async function getAuditLogs(limitCount = 200): Promise<AuditLog[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("timestamp", "desc"), limit(limitCount)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog));
}

export async function getAuditLogsByModule(module: AuditModule, limitCount = 100): Promise<AuditLog[]> {
  const snap = await getDocs(
    query(collection(db, COL), where("module", "==", module), orderBy("timestamp", "desc"), limit(limitCount))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog));
}

export async function getAuditLogsByUser(uid: string, limitCount = 100): Promise<AuditLog[]> {
  const snap = await getDocs(
    query(collection(db, COL), where("actorUid", "==", uid), orderBy("timestamp", "desc"), limit(limitCount))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog));
}
