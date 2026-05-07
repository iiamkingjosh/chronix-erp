import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, orderBy, where,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  TaxRule, VATRecord, WHTRecord, PAYERecord, TaxReport,
} from "@/types/tax";

const RULES  = "tax_rules";
const VAT    = "vat_records";
const WHT    = "withholding_tax";
const PAYE   = "payroll_tax";
const REPORT = "tax_reports";

/* ── Tax Rules ─────────────────────────────────────────────── */

export async function getTaxRules(): Promise<TaxRule[]> {
  const snap = await getDocs(query(collection(db, RULES), orderBy("taxType")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaxRule));
}

export async function getTaxRule(id: string): Promise<TaxRule | null> {
  const snap = await getDoc(doc(db, RULES, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as TaxRule) : null;
}

export async function createTaxRule(data: Omit<TaxRule, "id">): Promise<TaxRule> {
  const ref = await addDoc(collection(db, RULES), data);
  return { ...data, id: ref.id };
}

export async function updateTaxRule(id: string, data: Partial<TaxRule>): Promise<void> {
  await updateDoc(doc(db, RULES, id), { ...data, updatedAt: new Date().toISOString() });
}

export async function toggleTaxRule(id: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, RULES, id), {
    isActive,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTaxRule(id: string): Promise<void> {
  await deleteDoc(doc(db, RULES, id));
}

/** Seed default Nigerian tax rules if the collection is empty */
export async function seedDefaultTaxRules(createdBy: string): Promise<void> {
  const existing = await getDocs(collection(db, RULES));
  if (!existing.empty) return;

  const now = new Date().toISOString();
  const today = now.split("T")[0];
  const defaults: Omit<TaxRule, "id">[] = [
    {
      taxName: "Value Added Tax (VAT)",
      taxType: "VAT", rate: 7.5, appliesTo: "invoices",
      isActive: true, effectiveDate: today,
      description: "Standard Nigerian VAT rate per FIRS regulations",
      createdAt: now, updatedAt: now, createdBy,
    },
    {
      taxName: "WHT — Services",
      taxType: "WHT", rate: 5, appliesTo: "vendors",
      isActive: true, effectiveDate: today,
      description: "Withholding Tax on service payments to vendors",
      createdAt: now, updatedAt: now, createdBy,
    },
    {
      taxName: "WHT — Goods/Products",
      taxType: "WHT", rate: 2.5, appliesTo: "vendors",
      isActive: true, effectiveDate: today,
      description: "Withholding Tax on goods/product purchases",
      createdAt: now, updatedAt: now, createdBy,
    },
    {
      taxName: "PAYE — Employee Income Tax",
      taxType: "PAYE", rate: 0, appliesTo: "payroll",
      isActive: true, effectiveDate: today,
      description: "Progressive PAYE per Nigerian PITAM bands (7%–24%). Rate is computed per employee.",
      createdAt: now, updatedAt: now, createdBy,
    },
    {
      taxName: "Corporate Income Tax",
      taxType: "Corporate", rate: 30, appliesTo: "all",
      isActive: true, effectiveDate: today,
      description: "Nigeria corporate income tax at standard 30% rate (estimate only — not a tax filing)",
      createdAt: now, updatedAt: now, createdBy,
    },
  ];

  await Promise.all(defaults.map((d) => addDoc(collection(db, RULES), d)));
}

/* ── VAT Records ────────────────────────────────────────────── */

export async function getVATRecords(period?: string): Promise<VATRecord[]> {
  const snap = await getDocs(query(collection(db, VAT), orderBy("date", "desc")));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as VATRecord));
  return period ? all.filter((r) => r.period === period) : all;
}

export async function createVATRecord(data: Omit<VATRecord, "id">): Promise<VATRecord> {
  const ref = await addDoc(collection(db, VAT), data);
  return { ...data, id: ref.id };
}

/* ── WHT Records ────────────────────────────────────────────── */

export async function getWHTRecords(): Promise<WHTRecord[]> {
  const snap = await getDocs(query(collection(db, WHT), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WHTRecord));
}

export async function createWHTRecord(data: Omit<WHTRecord, "id">): Promise<WHTRecord> {
  const ref = await addDoc(collection(db, WHT), data);
  return { ...data, id: ref.id };
}

export async function updateWHTCertStatus(id: string, certStatus: "issued" | "pending"): Promise<void> {
  await updateDoc(doc(db, WHT, id), { certStatus });
}

/* ── PAYE Records ───────────────────────────────────────────── */

export async function getPAYERecords(period?: string): Promise<PAYERecord[]> {
  const snap = await getDocs(query(collection(db, PAYE), orderBy("period", "desc")));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PAYERecord));
  return period ? all.filter((r) => r.period === period) : all;
}

export async function createPAYERecord(data: Omit<PAYERecord, "id">): Promise<PAYERecord> {
  const ref = await addDoc(collection(db, PAYE), data);
  return { ...data, id: ref.id };
}

export async function getPAYEByEmployee(uid: string): Promise<PAYERecord[]> {
  const snap = await getDocs(
    query(collection(db, PAYE), where("employeeUid", "==", uid), orderBy("period", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PAYERecord));
}

/* ── Tax Reports ────────────────────────────────────────────── */

export async function getTaxReports(): Promise<TaxReport[]> {
  const snap = await getDocs(query(collection(db, REPORT), orderBy("generatedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaxReport));
}

export async function createTaxReport(data: Omit<TaxReport, "id">): Promise<TaxReport> {
  const ref = await addDoc(collection(db, REPORT), data);
  return { ...data, id: ref.id };
}
