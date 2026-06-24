import type { ReactNode } from "react";
import { Check, Lock } from "lucide-react";

export function HashChip({ hash }: { hash: string }) {
  const s = `${hash.slice(0, 6)}…${hash.slice(-4)}`;
  return (
    <span className="font-mono-chip" style={{ fontFamily: "var(--font-mono)" }}>
      <Lock className="h-3 w-3" /> {s}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "In Progress": "bg-amber-100 text-amber-800",
    "Awaiting Verification": "bg-cyan-100 text-cyan-800",
    Completed: "bg-emerald-100 text-emerald-800",
    Disputed: "bg-rose-100 text-rose-700",
    Locked: "bg-slate-100 text-slate-700",
    Released: "bg-emerald-100 text-emerald-800",
    Confirmed: "bg-cyan-100 text-cyan-800",
    Verified: "bg-cyan-100 text-cyan-800",
    Pending: "bg-amber-100 text-amber-800",
    Flagged: "bg-rose-100 text-rose-700",
    "Under Review": "bg-amber-100 text-amber-800",
    Resolved: "bg-emerald-100 text-emerald-800",
    "—": "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${map[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

export function VerifiedBadge({ children = "AI Verified" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: "color-mix(in oklab, var(--cyan-glow) 18%, white)", color: "color-mix(in oklab, var(--cyan-glow) 70%, black)", boxShadow:"0 0 0 1px color-mix(in oklab, var(--cyan-glow) 35%, transparent)" }}>
      <Check className="h-3 w-3" /> {children}
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--cyan-glow)", fontFamily: "var(--font-mono)" }}>
      {children}
    </div>
  );
}

export function HeroOrbs() {
  return (
    <>
      <div className="hero-orb" style={{ width: 520, height: 520, background: "var(--indigo)", top: -120, left: -120 }} />
      <div className="hero-orb" style={{ width: 480, height: 480, background: "var(--cyan-glow)", bottom: -160, right: -100, animationDelay: "-4s" }} />
      <div className="hero-orb" style={{ width: 320, height: 320, background: "var(--indigo-glow)", top: "40%", left: "55%", opacity: 0.35, animationDelay: "-8s" }} />
    </>
  );
}

export function ScoreRing({ value, color = "var(--cyan-glow)" }: { value: number; color?: string }) {
  const r = 38, c = 2 * Math.PI * r;
  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} stroke="rgba(100,116,139,0.15)" strokeWidth="8" fill="none" />
      <circle cx="50" cy="50" r={r} stroke={color} strokeWidth="8" fill="none"
        strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} strokeLinecap="round" transform="rotate(-90 50 50)"
        style={{ filter: `drop-shadow(0 0 8px color-mix(in oklab, ${color} 60%, transparent))` }} />
      <text x="50" y="56" textAnchor="middle" fill="currentColor" fontSize="20" fontWeight="700" fontFamily="var(--font-display)">{value}</text>
    </svg>
  );
}