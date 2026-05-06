"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { createEmployee, getEmployees } from "@/lib/hr-service";
import { getStaffList, type StaffMember } from "@/lib/tickets-service";
import { ROLES } from "@/types/roles";

const schema = z.object({
  uid:           z.string().min(1, "Required"),
  phone:         z.string().min(7, "Required"),
  department:    z.string().optional(),
  salary:        z.coerce.number().min(0, "Required"),
  bankName:      z.string().min(1, "Required"),
  accountNumber: z.string().min(10, "10-digit account number"),
  accountName:   z.string().min(2, "Required"),
  dateJoined:    z.string().min(1, "Required"),
  nokName:       z.string().min(1, "Required"),
  nokRelation:   z.string().min(1, "Required"),
  nokPhone:      z.string().min(7, "Required"),
  notes:         z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function AddEmployeePage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [users, setUsers]         = useState<StaffMember[]>([]);
  const [existing, setExisting]   = useState<Set<string>>(new Set());
  const [serverError, setServerError] = useState<string | null>(null);

  const canManage = profile ? hasPermission(profile.role, "manage:hr") : false;

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { dateJoined: new Date().toISOString().split("T")[0] },
  });

  const watchedUid = useWatch({ control, name: "uid" }) ?? "";
  const selectedUser = users.find((u) => u.uid === watchedUid);

  useEffect(() => {
    Promise.all([getStaffList(), getEmployees()]).then(([staff, emps]) => {
      setUsers(staff);
      setExisting(new Set(emps.map((e) => e.uid)));
    }).catch(() => {});
  }, []);

  async function onSubmit(data: FormData) {
    if (!profile || !canManage) return;
    if (!selectedUser) {
      setServerError("Select a valid user account first.");
      return;
    }
    setServerError(null);
    try {
      const now = new Date().toISOString();
      await createEmployee({
        id:            data.uid,
        uid:           data.uid,
        fullName:      selectedUser.displayName || selectedUser.email.split("@")[0] || "User",
        email:         selectedUser.email,
        phone:         data.phone,
        role:          selectedUser.role || ROLES.STAFF,
        department:    data.department ?? "",
        salary:        data.salary,
        bankName:      data.bankName,
        accountNumber: data.accountNumber,
        accountName:   data.accountName,
        dateJoined:    data.dateJoined,
        status:        "active",
        nextOfKin: {
          name:         data.nokName,
          relationship: data.nokRelation,
          phone:        data.nokPhone,
        },
        notes:            data.notes ?? "",
        performanceNotes: [],
        createdAt:        now,
        updatedAt:        now,
      });
      router.push(`/dashboard/hr/${data.uid}`);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Failed to create employee record");
    }
  }

  if (!canManage) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">You do not have permission to add employee records.</p></div>;
  }

  const availableUsers = users.filter((u) => !existing.has(u.uid));

  return (
    <div className="animate-fade-in max-w-3xl">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

        {/* Link to user account */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Link to User Account</h3>
          <div>
            <label className="field-label">Select Employee</label>
            <select {...register("uid")} className="input-field">
              <option value="">Select existing user account…</option>
              {availableUsers.map((u) => (
                <option key={u.uid} value={u.uid} className="bg-primary-dark">
                  {u.displayName} — {u.role}
                </option>
              ))}
            </select>
            {errors.uid && <p className="mt-1 text-xs text-red-400">{errors.uid.message}</p>}
            {availableUsers.length === 0 && (
              <p className="mt-2 text-xs text-white/30 font-helvetica">
                All users already have employee records, or no users exist.{" "}
                <a href="/setup/create-user" className="text-accent hover:underline">Create user accounts first.</a>
              </p>
            )}
          </div>
        </div>

        {/* Employment details */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Employment Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Phone</label>
              <input {...register("phone")} placeholder="+234 812 345 6789" className="input-field" />
              {errors.phone && <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>}
            </div>
            <div>
              <label className="field-label">Department</label>
              <input {...register("department")} placeholder="e.g. Engineering, Sales" className="input-field" />
            </div>
            <div>
              <label className="field-label">Monthly Salary (₦)</label>
              <input {...register("salary")} type="number" min="0" placeholder="0" className="input-field" />
              {errors.salary && <p className="mt-1 text-xs text-red-400">{errors.salary.message}</p>}
            </div>
            <div>
              <label className="field-label">Date Joined</label>
              <input {...register("dateJoined")} type="date" className="input-field" />
              {errors.dateJoined && <p className="mt-1 text-xs text-red-400">{errors.dateJoined.message}</p>}
            </div>
          </div>
        </div>

        {/* Bank details */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Bank Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Bank Name</label>
              <input {...register("bankName")} placeholder="e.g. GTBank, Access Bank" className="input-field" />
              {errors.bankName && <p className="mt-1 text-xs text-red-400">{errors.bankName.message}</p>}
            </div>
            <div>
              <label className="field-label">Account Number</label>
              <input {...register("accountNumber")} placeholder="10-digit account number" className="input-field" />
              {errors.accountNumber && <p className="mt-1 text-xs text-red-400">{errors.accountNumber.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Account Name</label>
              <input {...register("accountName")} placeholder="Name on bank account" className="input-field" />
              {errors.accountName && <p className="mt-1 text-xs text-red-400">{errors.accountName.message}</p>}
            </div>
          </div>
        </div>

        {/* Next of kin */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Next of Kin</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="field-label">Full Name</label>
              <input {...register("nokName")} placeholder="Next of kin name" className="input-field" />
              {errors.nokName && <p className="mt-1 text-xs text-red-400">{errors.nokName.message}</p>}
            </div>
            <div>
              <label className="field-label">Relationship</label>
              <input {...register("nokRelation")} placeholder="e.g. Spouse, Parent" className="input-field" />
              {errors.nokRelation && <p className="mt-1 text-xs text-red-400">{errors.nokRelation.message}</p>}
            </div>
            <div>
              <label className="field-label">Phone</label>
              <input {...register("nokPhone")} placeholder="+234 812 345 6789" className="input-field" />
              {errors.nokPhone && <p className="mt-1 text-xs text-red-400">{errors.nokPhone.message}</p>}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="surface-card p-6">
          <label className="field-label">Notes (optional)</label>
          <textarea {...register("notes")} rows={3} className="input-field resize-none" />
        </div>

        {serverError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm font-helvetica">{serverError}</p>
          </div>
        )}

        <button type="submit" disabled={isSubmitting || !watchedUid} className="btn-primary">
          {isSubmitting ? <><Spinner /> Saving…</> : "Save Employee Record"}
        </button>
      </form>
    </div>
  );
}

function Spinner() { return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>; }
