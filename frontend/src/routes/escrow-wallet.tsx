import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuthContext } from "@/context/AuthContext";
import { Wallet, ArrowUpRight, ArrowDownLeft, PlusCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/escrow-wallet")({
  head: () => ({ meta: [{ title: "Escrow Wallet — NexTrust" }] }),
  component: EscrowWallet,
});

function EscrowWallet() {
  const { user, profile } = useAuthContext();
  const role = profile?.role === 'worker' ? 'worker' : 'customer';
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(false);
  }, [user?.uid]);

  return (
    <DashboardShell role={role} greeting={`Escrow Wallet`}>
      <div className="space-y-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>Wallet Balance</h2>
              </div>
              <Button onClick={() => alert("Deposit flow coming soon!")} className="btn-pill-primary text-xs py-5">
                <PlusCircle className="h-4 w-4" /> Add Funds
              </Button>
            </div>
            <div className="rounded-2xl p-8 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg, var(--navy), var(--indigo))" }}>
              <div className="relative z-10">
                <div className="text-xs text-slate-300 uppercase tracking-widest font-bold" style={{ fontFamily: "var(--font-mono)" }}>Available Balance</div>
                <div className="text-5xl font-bold mt-2" style={{ fontFamily: "var(--font-display)" }}>$842.10</div>
                <div className="mt-6 flex items-center gap-2">
                  <span className="px-2 py-1 rounded bg-white/10 text-[10px] font-mono border border-white/10">0x8f2a…c821</span>
                  <span className="text-[10px] text-slate-400">NexTrust Escrow Vault</span>
                </div>
              </div>
              <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>Quick Stats</h3>
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Total Deposited</div>
                <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>$5,240.00</div>
              </div>
              <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100">
                <div className="text-[10px] text-indigo-600/70 uppercase tracking-widest font-bold mb-1">In Escrow</div>
                <div className="text-2xl font-bold text-indigo-900" style={{ fontFamily: "var(--font-display)" }}>$1,200.00</div>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                <div className="text-[10px] text-emerald-600/70 uppercase tracking-widest font-bold mb-1">Released</div>
                <div className="text-2xl font-bold text-emerald-900" style={{ fontFamily: "var(--font-display)" }}>$4,040.00</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>Transaction History</h3>
          </div>
          <div className="p-12 text-center">
            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <RefreshCw className="h-6 w-6 text-slate-300" />
            </div>
            <p className="text-slate-400 text-sm">No transactions to display yet.</p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
