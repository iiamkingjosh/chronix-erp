import {
  collection, doc, addDoc, getDocs, updateDoc,
  query, orderBy, where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { LeaveRequest, LeaveStatus } from "@/types/leave";

const COL = "leave_requests";

export async function createLeaveRequest(data: Omit<LeaveRequest, "id">): Promise<LeaveRequest> {
  const ref = await addDoc(collection(db, COL), data);
  return { ...data, id: ref.id };
}

export async function getLeaveRequests(): Promise<LeaveRequest[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("submittedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRequest));
}

export async function getMyLeaveRequests(uid: string): Promise<LeaveRequest[]> {
  const snap = await getDocs(
    query(collection(db, COL), where("employeeUid", "==", uid), orderBy("submittedAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRequest));
}

export async function reviewLeave(
  id: string,
  status: "approved" | "rejected",
  reviewerName: string,
  rejectionReason?: string
): Promise<void> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status, reviewedBy: reviewerName, reviewedAt: now };
  if (status === "rejected" && rejectionReason) update.rejectionReason = rejectionReason;
  await updateDoc(doc(db, COL, id), update);
}

export async function cancelLeave(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { status: "cancelled" as LeaveStatus });
}
