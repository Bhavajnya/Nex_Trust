import { Link } from "@tanstack/react-router";
import { Bell, ChevronDown, Gavel, LayoutDashboard, PlusCircle, Settings, Shield, Wallet, Briefcase } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function DashboardShell({
  role,
  greeting,
  children,
}: {
  role: "customer" | "worker";
  greeting: string;
  children: ReactNode;
}) {
  const [currentPath, setCurrentPath] = useState<string>("");

  useEffect(() => {
    // Only set path on client side to avoid hydration mismatch
    setCurrentPath(window.location.pathname);
  }, []);

  const base = role === "customer" ? "/dashboard/customer" : "/dashboard/worker";
  const nav = [
    { to: base, label: "Overview", icon: LayoutDashboard },
    role === "customer"
      ? { to: "/post-job", label: "Post a Job", icon: PlusCircle }
      : { to: "/find-jobs", label: "Find Jobs", icon: Briefcase },
    { to: "/my-jobs", label: "My Jobs", icon: Briefcase },
    { to: "/escrow-wallet", label: "Escrow Wallet", icon: Wallet },
    { to: "/disputes", label: "Disputes", icon: Gavel },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex w-full" style={{ background: "var(--background)" }}>
      <aside className="hidden lg:flex w-64 flex-col text-slate-200 shrink-0" style={{ background: "var(--navy)" }}>
        <Link to="/" className="h-16 flex items-center gap-2 px-6 border-b border-white/10 text-white font-bold" style={{fontFamily:"var(--font-display)"}}>
          <Shield className="h-5 w-5" style={{color:"var(--cyan-glow)"}} /> NexTrust
        </Link>
        <nav className="flex-1 p-4 space-y-1">
          {nav.map((n, i) => {
            const active = currentPath === n.to || (n.to === base && currentPath === base);
            const Icon = n.icon;
            return (
              <Link
                key={n.label + i}
                to={n.to}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition hover:bg-white/5"
                activeProps={{
                  className: "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition bg-white/10 text-white",
                }}
              >
                <Icon className="h-4 w-4" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 text-xs text-slate-400 border-t border-white/10">
          <div className="font-semibold text-slate-200 mb-2">Wallet connected</div>
          <span className="font-mono-chip" style={{fontFamily:"var(--font-mono)"}}>0x8f2a…c821</span>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 px-6 flex items-center justify-between border-b bg-white">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider" style={{color:"var(--cyan-glow)", fontFamily:"var(--font-mono)"}}>
              {role === "customer" ? "Customer" : "Worker"} Dashboard
            </div>
            <div className="text-base sm:text-lg font-semibold truncate" style={{fontFamily:"var(--font-display)"}}>{greeting}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className="relative p-2 rounded-full hover:bg-slate-100">
              <Bell className="h-5 w-5 text-slate-600" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full" style={{background:"var(--amber-brand)"}} />
            </button>
            <button className="flex items-center gap-2 p-1 pr-3 rounded-full hover:bg-slate-100">
              <span className="grid place-items-center h-8 w-8 rounded-full text-white font-semibold" style={{background:"var(--indigo)"}}>
                {greeting.split(" ").pop()?.[0] ?? "U"}
              </span>
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
