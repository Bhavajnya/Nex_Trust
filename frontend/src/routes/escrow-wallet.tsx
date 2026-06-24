import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuthContext } from "@/context/AuthContext";
import { Wallet, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/escrow-wallet")({
  head: () => ({ meta: [{ title: "Escrow Wallet — NexTrust" }] }),
  component: EscrowWallet,
});

function EscrowWallet() {
  const { user, profile } = useAuthContext();
  const role = profile?.role === 'worker' ? 'worker' : 'customer';
  const [walletData, setWalletData] = useState({ balance: 0, transactions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(false);
  }, [user?.uid]);

  return (
    <DashboardShell role={role} greeting={`Escrow Wallet`}>
      <div className="space-y-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-bold">Wallet Balance</h2>
            </div>
            <div className="rounded-xl p-6 text-white" style={{ background: "linear-gradient(135deg, var(--navy), var(--indigo))" }}>
              <div className="text-sm text-slate-200 uppercase tracking-wider">Available Balance</div>
              <div className="text-4xl font-bold mt-2">$842.10</div>
              <div className="mt-4 text-xs font-mono">0x8f2a…c821</div>
            </div>
            <button className="mt-6 w-full px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700">Deposit Funds</button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="font-bold mb-4">Quick Stats</h3>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 uppercase">Total Deposited</div>
                <div className="text-2xl font-bold text-slate-900">$5,240.00</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase">In Escrow</div>
                <div className="text-2xl font-bold text-slate-900">$1,200.00</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase">Released</div>
                <div className="text-2xl font-bold text-slate-900">$4,040.00</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-bold mb-4">Transaction History</h3>
          <p className="text-slate-500 text-center py-8">No transactions yet</p>
        </div>
      </div>
    </DashboardShell>
  );
}
