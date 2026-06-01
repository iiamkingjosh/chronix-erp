import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const MANAGER_ROLES = new Set(["HR", "CEO", "Root Admin", "System Admin"]);

export async function GET(req: NextRequest) {
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const decoded   = await getAdminAuth().verifyIdToken(idToken);
    const callerUid = decoded.uid;

    const callerSnap = await getAdminDb().collection("users").doc(callerUid).get();
    const callerRole = callerSnap.data()?.role as string | undefined;
    if (!callerRole || !MANAGER_ROLES.has(callerRole)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const uid   = req.nextUrl.searchParams.get("uid");
    const month = parseInt(req.nextUrl.searchParams.get("month") ?? "0", 10);
    const year  = parseInt(req.nextUrl.searchParams.get("year")  ?? "0", 10);

    if (!uid || !month || !year) {
      return NextResponse.json({ error: "uid, month, year required" }, { status: 400 });
    }

    // Build ISO date range for the month
    const rangeStart = new Date(year, month - 1, 1).toISOString();
    const rangeEnd   = new Date(year, month, 0, 23, 59, 59).toISOString();

    const db = getAdminDb();

    // ── Task Completion Rate ──────────────────────────────────
    // Tasks are embedded arrays inside project documents.
    const projectsSnap = await db.collection("projects").get();
    let totalTasks = 0;
    let doneTasks  = 0;

    for (const proj of projectsSnap.docs) {
      const tasks = (proj.data().tasks ?? []) as Array<{
        assignedTo: string;
        status: string;
        createdAt: string;
      }>;
      const mine = tasks.filter(
        (t) =>
          t.assignedTo === uid &&
          t.createdAt >= rangeStart &&
          t.createdAt <= rangeEnd
      );
      totalTasks += mine.length;
      doneTasks  += mine.filter((t) => t.status === "done").length;
    }

    const taskCompletionRate =
      totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

    // ── Ticket Resolution Rate ────────────────────────────────
    const ticketsSnap = await db
      .collection("tickets")
      .where("assignedTo", "==", uid)
      .get();

    const monthTickets = ticketsSnap.docs.filter((d) => {
      const t = d.data().createdAt as string | undefined;
      return t && t >= rangeStart && t <= rangeEnd;
    });

    const resolvedTickets = monthTickets.filter((d) => {
      const s = d.data().status as string;
      return s === "resolved" || s === "closed";
    }).length;

    const ticketResolutionRate =
      monthTickets.length === 0
        ? 0
        : Math.round((resolvedTickets / monthTickets.length) * 100);

    return NextResponse.json({ taskCompletionRate, ticketResolutionRate });
  } catch (err) {
    console.error("[performance/compute] error:", err);
    return NextResponse.json(
      { error: `Internal error — ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
