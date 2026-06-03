import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc,
  query, orderBy, where, limit,
} from "firebase/firestore";
import { db } from "./firebase";
import type { LeaveRequest, LeaveStatus } from "@/types/leave";
import { LEAVE_TYPE_LABELS } from "@/types/leave";
import { createNotification, notifyAssignment } from "@/lib/notifications-service";

const COL = "leave_requests";

export async function createLeaveRequest(data: Omit<LeaveRequest, "id">): Promise<LeaveRequest> {
  const ref = await addDoc(collection(db, COL), data);
  const request = { ...data, id: ref.id };

  const leaveLabel = LEAVE_TYPE_LABELS[data.leaveType] ?? data.leaveType;
  createNotification({
    type:        "leave_submitted",
    title:       "Leave Request Awaiting Approval",
    message:     `${data.employeeName} has requested ${leaveLabel} from ${data.startDate} to ${data.endDate} (${data.days} day${data.days !== 1 ? "s" : ""}).`,
    link:        `/dashboard/hr/leave`,
    read:        false,
    targetRoles: ["Root Admin", "CEO", "HR Manager", "IT Manager", "HR"],
    targetUids:  [],
    createdAt:   new Date().toISOString(),
    dedupeKey:   `leave-submitted-${ref.id}`,
  }).catch(() => {});

  return request;
}

export async function getLeaveRequests(): Promise<LeaveRequest[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("submittedAt", "desc"), limit(100)));
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

  const snap = await getDoc(doc(db, COL, id));
  if (snap.exists()) {
    const req = { id: snap.id, ...snap.data() } as LeaveRequest;
    if (req.employeeUid) {
      const leaveLabel = LEAVE_TYPE_LABELS[req.leaveType] ?? req.leaveType;
      if (status === "approved") {
        notifyAssignment({
          type:         "leave_approved",
          title:        "Leave Request Approved",
          message:      `Your ${leaveLabel} from ${req.startDate} to ${req.endDate} has been approved.`,
          link:         `/dashboard/hr/leave`,
          assigneeUid:  req.employeeUid,
          assigneeName: req.employeeName,
          dedupeKey:    `leave-approved-${id}`,
        }).catch(() => {});
      } else {
        notifyAssignment({
          type:         "leave_rejected",
          title:        "Leave Request Not Approved",
          message:      `Your ${leaveLabel} request was not approved.${rejectionReason ? ` Reason: ${rejectionReason}` : " Please speak with HR."}`,
          link:         `/dashboard/hr/leave`,
          assigneeUid:  req.employeeUid,
          assigneeName: req.employeeName,
          dedupeKey:    `leave-rejected-${id}`,
        }).catch(() => {});
      }
    }
  }
}

export async function cancelLeave(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { status: "cancelled" as LeaveStatus });
}
