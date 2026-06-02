import { db } from "@/lib/firebase";
import { collection, doc, setDoc, getDocs, query, where } from "firebase/firestore";
import { getJournalEntriesByDateRange } from "./journal-entries";
import type { VATReturn } from "@/types/finance";

export async function saveVATReturn(report: VATReturn, userId: string): Promise<VATReturn> {
  const filed: VATReturn = {
    ...report,
    status:    "filed",
    filedDate: new Date().toISOString().split("T")[0],
    createdBy: userId,
  };
  await setDoc(doc(db, "vat_returns", report.id), filed);
  return filed;
}

export async function getVATReturnForPeriod(period: string): Promise<VATReturn | null> {
  const snap = await getDocs(
    query(collection(db, "vat_returns"), where("period", "==", period))
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as VATReturn;
}

export async function generateVATReturn(month: string, userId: string): Promise<VATReturn> {
  const [year, mm] = month.split("-");
  const startDate  = `${year}-${mm}-01`;
  const lastDay    = new Date(parseInt(year), parseInt(mm), 0).getDate();
  const endDate    = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

  const entries = await getJournalEntriesByDateRange(startDate, endDate);

  const collected: VATReturn["vatCollected"] = {
    itServices: 0, hardwareSales: 0, branding: 0, other: 0, total: 0,
  };
  const paid: VATReturn["vatPaid"] = {
    purchases: 0, operatingExpenses: 0, capital: 0, total: 0,
  };

  for (const entry of entries) {
    const desc = entry.description.toLowerCase();
    for (const line of entry.lineItems) {
      // Output VAT — account 2100 credits
      if (line.accountCode === "2100" && line.credit > 0) {
        if (desc.includes("hardware") || desc.includes("laptop") ||
            desc.includes("ssd")      || desc.includes("ups"))
          collected.hardwareSales += line.credit;
        else if (desc.includes("brand") || desc.includes("design"))
          collected.branding      += line.credit;
        else if (desc.includes("consulting") || desc.includes("network") ||
                 desc.includes("software"))
          collected.itServices    += line.credit;
        else
          collected.other         += line.credit;
      }
      // Input VAT — account 1110 debits (VAT Recoverable asset account)
      if (line.accountCode === "1110" && line.debit > 0) {
        if (desc.includes("purchase") || desc.includes("inventory"))
          paid.purchases          += line.debit;
        else if (desc.includes("equipment") || desc.includes("furniture"))
          paid.capital            += line.debit;
        else
          paid.operatingExpenses  += line.debit;
      }
    }
  }

  collected.total = collected.itServices + collected.hardwareSales +
                    collected.branding   + collected.other;
  paid.total      = paid.purchases + paid.operatingExpenses + paid.capital;

  const netVAT = collected.total - paid.total;

  return {
    id:           `vat_${month}`,
    returnNumber: `VAT-${year}-${mm}`,
    period:       month,
    startDate,
    endDate,
    vatCollected: collected,
    vatPaid:      paid,
    netVAT,
    vatPayable:   netVAT > 0 ? netVAT : 0,
    vatRefundable: netVAT < 0 ? Math.abs(netVAT) : 0,
    status:       "draft",
    createdAt:    new Date().toISOString(),
    createdBy:    userId,
  };
}
