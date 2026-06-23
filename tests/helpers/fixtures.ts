import type { Invoice, Payment } from "@/types/finance";
import type { Expense } from "@/types/expense";

export function makeInvoice(overrides: Partial<Invoice> = {}): Omit<Invoice, "id"> {
  const subtotal = overrides.subtotal ?? 100_000;
  const vatAmount = overrides.vatAmount ?? subtotal * 0.075;
  const total = overrides.total ?? subtotal + vatAmount;
  const base: Record<string, unknown> = {
    invoiceNumber: overrides.invoiceNumber ?? `CT-TEST-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    invoiceDate: overrides.invoiceDate ?? new Date().toISOString().split("T")[0],
    dueDate: overrides.dueDate ?? new Date().toISOString().split("T")[0],
    status: overrides.status ?? "pending",
    client: overrides.client ?? { name: "Test Client Ltd", address: "1 Test Street", phone: "+2348000000000" },
    salesperson: overrides.salesperson ?? "test-uid",
    items: overrides.items ?? [{ id: "1", name: "IT Consulting Services", unitPrice: subtotal, quantity: 1, lineTotal: subtotal }],
    subtotal,
    vatRate: overrides.vatRate ?? 0.075,
    vatAmount,
    total,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    createdBy: overrides.createdBy ?? "test-uid",
  };
  // Only include optional fields when explicitly provided — Firestore's
  // client SDK rejects explicit `undefined` field values outright.
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) base[k] = v;
  }
  return base as Omit<Invoice, "id">;
}

export function makePayment(invoice: Invoice, overrides: Partial<Payment> = {}): Omit<Payment, "id"> {
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    clientName: invoice.client.name,
    amount: overrides.amount ?? invoice.total,
    vatAmount: overrides.vatAmount,
    paymentDate: overrides.paymentDate ?? new Date().toISOString().split("T")[0],
    method: overrides.method ?? "bank_transfer",
    recordedBy: overrides.recordedBy ?? "test-uid",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    ...overrides,
  } as Omit<Payment, "id">;
}

export function makeExpense(overrides: Partial<Expense> = {}): Omit<Expense, "id"> {
  return {
    title: overrides.title ?? "Test expense",
    category: overrides.category ?? "software",
    amount: overrides.amount ?? 25_000,
    date: overrides.date ?? new Date().toISOString().split("T")[0],
    description: overrides.description ?? "Test expense description",
    status: overrides.status ?? "pending",
    submittedBy: overrides.submittedBy ?? "Test Submitter",
    submittedByUid: overrides.submittedByUid ?? "test-uid",
    submittedAt: overrides.submittedAt ?? new Date().toISOString(),
    ...overrides,
  } as Omit<Expense, "id">;
}
