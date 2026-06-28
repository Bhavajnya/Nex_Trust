import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Bot, Lock, PlusCircle, TrendingUp, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { HashChip, StatusBadge, VerifiedBadge } from "@/components/ui-bits";
import { useAuthContext } from "@/context/AuthContext";
import { MagicHandshakeAPI } from "@/lib/api";
import { escrowTx, verificationFeed } from "@/lib/mock-data";

export const Route = createFileRoute("/dashboard/customer")({
  head: () => ({ meta: [{ title: "Customer Dashboard — Magic Handshake" }] }),
  component: CustomerDashboard,
});

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200">
      <div className="text-xs text-slate-500 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>{label}</div>
      <div className="mt-2 text-3xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>{value}</div>
      {hint && <div className="mt-1 text-xs flex items-center gap-1" style={{ color: accent ?? "var(--emerald-brand)" }}><TrendingUp className="h-3 w-3" />{hint}</div>}
    </div>
  );
}

function CustomerDashboard() {
  const { user, profile } = useAuthContext();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const api = new MagicHandshakeAPI();
  const navigate = useNavigate();

  useEffect(() => {
    const loadJobs = async () => {
      try {
        setLoading(true);
        if (!user?.uid) return;

        // Fetch customer's jobs from API (role: customer filters for jobs this user created)
        const jobs = await api.listJobs({ role: 'customer', limit: 10, offset: 0 });
        setJobs(jobs || []);
      } catch (err) {
        console.error('[v0] Failed to load jobs:', err);
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };

    loadJobs();
  }, [user?.uid]);

  const activeJobs = jobs.filter(j => ['CREATED', 'FUNDED', 'IN_PROGRESS'].includes(j.status)).length;
  const completedJobs = jobs.filter(j => j.status === 'RELEASED').length;
  const totalSpent = jobs.reduce((sum, j) => sum + (j.budget || 0), 0);

  return (
    <DashboardShell role="customer" greeting={`Welcome back, ${profile?.name || 'Customer'}`}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Spent" value={`$${totalSpent}`} />
        <StatCard label="Active Jobs" value={String(activeJobs)} accent="var(--cyan-glow)" />
        <StatCard label="Completed Jobs" value={String(completedJobs)} />
        <StatCard label="Trust Score" value={String(profile?.trustScore || 50)} />
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h3 className="font-bold text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Active Jobs</h3>
            <Link to="/post-job" className="btn-pill-primary text-sm"><PlusCircle className="h-4 w-4" /> Post a Job</Link>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-slate-500">No jobs yet. <Link to="/post-job" className="text-blue-500 hover:underline">Post your first job</Link></p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
                  <tr>
                    <th className="text-left px-5 py-3">Job</th>
                    <th className="text-left px-3 py-3">Worker</th>
                    <th className="text-left px-3 py-3">Status</th>
                    <th className="text-left px-3 py-3">Budget</th>
                    <th className="text-right px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                  <tr key={j.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="font-semibold" style={{ color: "var(--navy)" }}>{j.title}</div>
                      <div className="text-xs text-slate-500" style={{ fontFamily: "var(--font-mono)" }}>#{j.id?.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-4 text-slate-700">{j.workerId || '-'}</td>
                    <td className="px-3 py-4"><StatusBadge status={j.status} /></td>
                    <td className="px-3 py-4">
                      <div className="font-semibold" style={{ color: "var(--navy)" }}>${j.budget}</div>
                    </td>
                    <td className="px-3 py-4">{j.ai === "Verified" ? <VerifiedBadge /> : <StatusBadge status={j.ai} />}</td>
                    <td className="px-5 py-4 text-right">
                      <button 
                        className="text-sm font-semibold inline-flex items-center gap-1 hover:underline transition-all" 
                        style={{ color: "var(--indigo)" }} 
                        onClick={() => navigate({ to: `/job/${j.id}` })}
                      >
                        View Details <ArrowUpRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Escrow Wallet</h3>
            <button className="btn-pill-primary text-xs" onClick={() => navigate({ to: '/escrow/deposit' })}>Add Funds</button>
          </div>
          <div className="rounded-xl p-4 text-white" style={{ background: "linear-gradient(135deg, var(--navy), var(--indigo))" }}>
            <div className="text-xs uppercase tracking-wider text-slate-200" style={{ fontFamily: "var(--font-mono)" }}>Available balance</div>
            <div className="text-3xl font-bold mt-1" style={{ fontFamily: "var(--font-display)" }}>$842.10</div>
            <div className="mt-2"><span className="font-mono-chip" style={{ fontFamily: "var(--font-mono)" }}>0x8f2a…c821</span></div>
          </div>
          <div className="mt-5 space-y-3">
            {escrowTx.map((t) => (
              <div key={t.title + t.date} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <div className="font-semibold truncate" style={{ color: "var(--navy)" }}>{t.title}</div>
                  <div className="text-xs text-slate-500">{t.date} · <span style={{ fontFamily: "var(--font-mono)" }}>{t.hash.slice(0, 6)}…{t.hash.slice(-4)}</span></div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className={`font-semibold ${t.amount < 0 ? "text-slate-700" : "text-emerald-600"}`}>{t.amount < 0 ? `-$${Math.abs(t.amount)}` : `+$${t.amount}`}</div>
                  <StatusBadge status={t.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="h-5 w-5" style={{ color: "var(--cyan-glow)" }} />
          <h3 className="font-bold text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>AI Verification Activity</h3>
        </div>
        <ul className="space-y-3">
          {verificationFeed.map((f, i) => (
            <li key={i} className="flex items-start gap-3 text-sm p-3 rounded-xl bg-slate-50">
              <span className="text-lg">{f.icon}</span>
              <span className="flex-1 text-slate-700">{f.text}</span>
              <span className="text-xs text-slate-500" style={{ fontFamily: "var(--font-mono)" }}>{f.time}</span>
            </li>
          ))}
        </ul>
      </div>
    </DashboardShell>
  );
}
