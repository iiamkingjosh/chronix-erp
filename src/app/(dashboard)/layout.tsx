"use client";

import { useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import PushPrompt from "@/components/PushPrompt";
import ChronixLogo from "@/components/ChronixLogo";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ProtectedRoute excludeClient>
      <div className="flex min-h-screen bg-primary-gradient">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile-only fixed header — invisible on lg+ */}
          <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-primary-dark/95 backdrop-blur-sm border-b border-white/10 flex items-center px-4 gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              aria-label="Open navigation"
            >
              <MenuIcon />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2 flex-1 justify-center">
              <ChronixLogo size={22} />
              <span className="font-orbitron text-xs font-black tracking-[0.12em] text-white">CHRONIX</span>
            </Link>
            {/* Spacer to balance the hamburger button */}
            <div className="w-8" />
          </header>

          {/* pt-14 clears the fixed mobile header; removed on lg+ */}
          <main className="flex-1 overflow-auto pt-14 lg:pt-0">
            {children}
          </main>
        </div>

        <PushPrompt />
      </div>
    </ProtectedRoute>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
