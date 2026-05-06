import { ClientAuthProvider } from "@/contexts/ClientAuthContext";

export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return <ClientAuthProvider>{children}</ClientAuthProvider>;
}
