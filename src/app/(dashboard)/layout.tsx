import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import PushPrompt from "@/components/PushPrompt";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute excludeClient>
      <div className="flex min-h-screen bg-primary-gradient">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
        <PushPrompt />
      </div>
    </ProtectedRoute>
  );
}
