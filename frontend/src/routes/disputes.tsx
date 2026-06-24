import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AlertTriangle, Bot, Camera, CheckCircle2, FileCheck, MapPin, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { HashChip, StatusBadge, VerifiedBadge } from "@/components/ui-bits";
import { useAuthContext } from "@/context/AuthContext";
import { MagicHandshakeAPI } from "@/lib/api";

export const Route = createFileRoute("/disputes")({
  head: () => ({ meta: [{ title: "Dispute Center — NexTrust" }] }),
  component: DisputesPage,
});

function DisputesPage() {
  const { user } = useAuthContext();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const api = new MagicHandshakeAPI();

  useEffect(() => {
    const loadDisputes = async () => {
      try {
        setLoading(true);
        if (!user?.uid) return;

        // Fetch disputes from API
        const disputeList = await api.listDisputes({ limit: 20, offset: 0 });
        setDisputes(disputeList || []);
        if (disputeList && disputeList.length > 0) {
          setSelectedId(disputeList[0].id);
        }
      } catch (err) {
        console.error('[v0] Failed to load disputes:', err);
        setError('Failed to load disputes. Please try again.');
        setDisputes([]);
      } finally {
        setLoading(false);
      }
    };

    loadDisputes();
  }, [user?.uid]);

  const selected = disputes.find(d => d.id === selectedId);

  const handleAcceptVerdict = async () => {
    if (!selected) return;
    try {
      setActionError(null);
      setActionLoading(true);
      console.log('[v0] Accepting AI verdict for dispute:', selected.id);
      // In production, call api.acceptDisputeVerdict(selected.id)
      // For now, just show success
      setActionError(null);
    } catch (err) {
      console.error('[v0] Failed to accept verdict:', err);
      setActionError('Failed to accept verdict. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestMediator = async () => {
    if (!selected) return;
    try {
      setActionError(null);
      setActionLoading(true);
      console.log('[v0] Requesting human mediator for dispute:', selected.id);
      // In production, call api.requestMediator(selected.id)
      setActionError(null);
    } catch (err) {
      console.error('[v0] Failed to request mediator:', err);
      setActionError('Failed to request mediator. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!selected) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
        <div style={{ background: "var(--navy)" }}><SiteNav /></div>
        <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-10 flex items-center justify-center">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          ) : (
            <p className="text-slate-500">No disputes found.</p>
          )}
        </main>
        <SiteFooter />
      </div>
    );
  }

  const timeline = [
    { icon: FileCheck, label: "Job Posted", done: true },
    { icon: ShieldCheck, label: "Escrow Funded", done: true },
    { icon: Camera, label: "Work Submitted", done: true },
    { icon: AlertTriangle, label: "Evidence Flagged", done: true },
    { icon: AlertTriangle, label: "Dispute Opened", done: true },
    { icon: Bot, label: "AI Review", done: selected.status === "RESOLVED" },
    { icon: CheckCircle2, label: "Resolution", done: selected.status === "RESOLVED" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <div style={{ background: "var(--navy)" }}><SiteNav /></div>
      <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-10">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}
        <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Dispute Center</h1>
        <div className="mt-3 rounded-2xl p-4 border" style={{ background: "color-mix(in oklab, var(--cyan-glow) 8%, white)", borderColor: "color-mix(in oklab, var(--cyan-glow) 35%, transparent)" }}>
          <div className="flex items-start gap-3 text-sm" style={{ color: "var(--navy)" }}>
            <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: "color-mix(in oklab, var(--cyan-glow) 60%, var(--navy))" }} />
            All disputes are resolved transparently. Every decision is logged on-chain.
          </div>
        </div>

        <div className="mt-8 grid lg:grid-cols-3 gap-6">
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : disputes.length === 0 ? (
              <p className="text-slate-500 text-sm">No disputes available.</p>
            ) : (
              disputes.map((d) => (
                <button key={d.id} onClick={() => setSelectedId(d.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition ${selectedId === d.id ? "border-indigo-400 bg-indigo-50/40" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{ fontFamily: "var(--font-mono)", color: "var(--slate-text)" }}>{d.id}</span>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="font-bold mt-2" style={{ color: "var(--navy)" }}>{d.jobId || 'Unknown Job'}</div>
                  <div className="text-xs text-slate-500 mt-1">{d.buyerId && d.freelancerId ? `${d.buyerId} ↔ ${d.freelancerId}` : 'Parties unknown'}</div>
                  <div className="text-xs text-slate-400 mt-1">Filed {new Date(d.createdAt).toLocaleDateString()}</div>
                </button>
              ))
            )}
          </div>

          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--slate-text)" }}>{selected.id}</div>
                <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>{selected.jobId || 'Job'}</h2>
                <div className="text-sm text-slate-500">{selected.buyerId && selected.freelancerId ? `${selected.buyerId} ↔ ${selected.freelancerId}` : 'Parties unknown'}</div>
              </div>
              <StatusBadge status={selected.status} />
            </div>

            <ol className="mt-6 relative border-l-2 border-slate-100 pl-6 space-y-4">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[33px] h-7 w-7 grid place-items-center rounded-full ${t.done ? "text-white" : "text-slate-400 bg-slate-100"}`} style={t.done ? { background: "var(--indigo)" } : undefined}>
                    <t.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className={`text-sm font-semibold ${t.done ? "" : "text-slate-400"}`} style={t.done ? { color: "var(--navy)" } : undefined}>{t.label}</div>
                </li>
              ))}
            </ol>

            <div className="mt-6 grid sm:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="aspect-video rounded-xl border border-slate-200 relative overflow-hidden" style={{ background: "linear-gradient(135deg,#E2E8F0,#CBD5E1)" }}>
                  <Camera className="absolute inset-0 m-auto h-8 w-8 text-slate-400" />
                  <span className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white" style={{ fontFamily: "var(--font-mono)" }}>14:0{i + 1} UTC</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500 px-1">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" style={{ color: "var(--cyan-glow)" }} /> GPS within 8m of site</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>3 photos · 1 video · 12s</span>
            </div>

            <div className="mt-6 rounded-2xl p-5" style={{ background: "color-mix(in oklab, var(--cyan-glow) 10%, white)", border: "1px solid color-mix(in oklab, var(--cyan-glow) 35%, transparent)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-bold" style={{ color: "var(--navy)" }}>
                  <Bot className="h-5 w-5" style={{ color: "color-mix(in oklab, var(--cyan-glow) 60%, var(--navy))" }} /> AI Verdict
                </div>
                {selected.aiConfidence && <VerifiedBadge>Confidence {selected.aiConfidence}%</VerifiedBadge>}
              </div>
              <p className="text-sm" style={{ color: "var(--navy)" }}>{selected.verdict || 'Pending AI analysis...'}</p>
              <div className="mt-3 text-xs text-slate-600">Resolution ID: <HashChip hash={selected.id} /></div>
            </div>

            {actionError && (
              <div className="mt-6 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-900 text-sm">Action Failed</p>
                  <p className="text-sm text-red-700 mt-1">{actionError}</p>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button 
                onClick={handleAcceptVerdict}
                disabled={actionLoading}
                className="btn-pill-primary disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : 'Accept AI Verdict'}
              </button>
              <button 
                onClick={handleRequestMediator}
                disabled={actionLoading}
                className="btn-pill-ghost disabled:opacity-50"
                style={{ color: "var(--indigo)", borderColor: "color-mix(in oklab, var(--indigo) 50%, transparent)" }}
              >
                {actionLoading ? 'Processing...' : 'Request Human Mediator'}
              </button>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
