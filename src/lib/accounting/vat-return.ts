import { db } from "@/lib/firebase";
import { collection, doc, setDoc, getDocs, query, where } from "firebase/firestore";
import { getJournalEntriesByDateRange, createJournalEntry } from "./journal-entries";
import { round } from "@/lib/utils";
import type { VATReturn } from "@/types/finance";

export async function saveVATReturn(report: VATReturn, userId: string): Promise<VATReturn> {
  const filed: VATReturn = {
    ...report,
    status:    "filed",
    filedDate: new Date().toISOString().split("T")[0],
    createdBy: userId,
  };
  await setDoc(doc(db, "vat_returns", report.id), filed);

  // Post cash-out journal entry when VAT is remitted to FIRS
  if (report.vatPayable > 0 && report.status !== "filed") {
    createJournalEntry({
      entryDate:     filed.filedDate!,
      description:   `VAT remittance to FIRS — ${report.period}`,
      reference:     filed.returnNumber,
      referenceType: "manual",
      referenceId:   report.id,
      lineItems: [
        { accountCode: "2100", accountName: "VAT Payable",             debit: round(report.vatPayable), credit: 0,                        description: `VAT paid to FIRS — ${report.period}` },
        { accountCode: "1010", accountName: "Cash in Bank — Fidelity", debit: 0,                        credit: round(report.vatPayable), description: `FIRS remittance — ${report.period}` },
      ],
      status:    "posted",
      createdBy: userId,
      postedBy:  userId,
      postedAt:  new Date().toISOString(),
    }).catch((e) => console.error("[VAT] FIRS remittance journal failed:", e));
  }

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
    for (const line of entry.lineItems) {
      // Output VAT — account 2100 credits: classify by the revenue account code
      // (4xxx) on the same journal entry, not by description keywords.
      if (line.accountCode === "2100" && line.credit > 0) {
        const revCode = entry.lineItems.find((l) => l.accountCode.startsWith("4"))?.accountCode ?? "";
        if      (revCode === "4030") collected.hardwareSales += line.credit;
        else if (revCode === "4040") collected.branding      += line.credit;
        else if (revCode === "4010" || revCode === "4020" || revCode === "4050")
                                     collected.itServices    += line.credit;
        else                         collected.other         += line.credit;
      }
      // Input VAT — account 1110 debits: classify by the cost account code
      // (5xxx → purchases, 6xxx → operating expenses) on the same entry.
      if (line.accountCode === "1110" && line.debit > 0) {
        const costCode = entry.lineItems.find(
          (l) => l.accountCode.startsWith("5") || l.accountCode.startsWith("6")
        )?.accountCode ?? "";
        if (costCode.startsWith("5")) paid.purchases         += line.debit;
        else                          paid.operatingExpenses += line.debit;
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
