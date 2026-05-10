"use client";

import Link from "next/link";
import ChronixLogo from "@/components/ChronixLogo";
import { APP_VERSION_SHORT_LABEL } from "@/lib/app-version";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen bg-primary-gradient flex items-center justify-center p-4">
      <div className="text-center animate-fade-in">
        <ChronixLogo size={64} className="mx-auto mb-6" />
        <h1 className="font-orbitron text-4xl font-bold text-accent mb-2">403</h1>
        <h2 className="font-orbitron text-lg text-white mb-3">Access Denied</h2>
        <p className="text-white/40 text-sm mb-6 max-w-sm mx-auto font-helvetica">
          You do not have permission to access this resource.
          Contact your System Administrator if you believe this is an error.
        </p>
        <Link href="/dashboard" className="btn-primary inline-flex">
          Back to Dashboard
        </Link>
        <p className="text-white/15 text-[10px] font-orbitron tracking-widest mt-10">{APP_VERSION_SHORT_LABEL}</p>
      </div>
    </main>
  );
}
