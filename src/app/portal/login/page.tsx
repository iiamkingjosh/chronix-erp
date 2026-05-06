"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-service";
import ChronixLogo from "@/components/ChronixLogo";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const profile = await signIn(email, password);
      if (profile.role !== "Client") {
        setError("This portal is for clients only. Staff should use the main login.");
        setLoading(false);
        return;
      }
      router.push("/portal");
    } catch {
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #001a33 0%, #003366 50%, #001a33 100%)" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <ChronixLogo size={52} />
          </div>
          <h1 className="font-orbitron text-xl font-black tracking-[0.1em] text-white">CHRONIX</h1>
          <p className="font-orbitron text-[10px] tracking-[0.3em] text-secondary mt-1">CLIENT PORTAL</p>
          <p className="text-white/40 text-sm font-helvetica mt-3">Sign in to access your services</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-white/50 font-helvetica uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 font-helvetica focus:outline-none focus:border-accent/50 focus:bg-white/[0.07] transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/50 font-helvetica uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 font-helvetica focus:outline-none focus:border-accent/50 focus:bg-white/[0.07] transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm font-helvetica">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold font-helvetica py-3.5 rounded-xl transition-all text-sm"
          >
            {loading ? "Signing in…" : "Sign In to Portal"}
          </button>
        </form>

        <p className="text-center text-xs text-white/20 font-helvetica mt-6">
          Are you a staff member?{" "}
          <a href="/login" className="text-secondary hover:text-white transition-colors">
            Staff login →
          </a>
        </p>
      </div>
    </div>
  );
}
