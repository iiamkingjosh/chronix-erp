"use client";

export default function InactivityWarningModal({ onStayLoggedIn }: { onStayLoggedIn: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="surface-card w-full max-w-sm p-6 bg-primary-mid border border-amber-500/30 rounded-2xl animate-fade-in">
        <h3 className="font-orbitron text-sm font-bold text-white mb-2">Still there?</h3>
        <p className="text-white/50 text-sm font-helvetica leading-relaxed mb-5">
          You&apos;ll be logged out in 1 minute due to inactivity.
        </p>
        <button
          onClick={onStayLoggedIn}
          className="btn-primary w-full text-sm py-3"
        >
          Stay logged in
        </button>
      </div>
    </div>
  );
}
