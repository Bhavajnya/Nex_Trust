import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CreditCard, Lock, Shield, Wallet, Loader2 } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { HashChip } from "@/components/ui-bits";
import { api } from "../lib/api";
import { useAuthContext } from "../context/AuthContext";

export const Route = createFileRoute("/post-job")({
  head: () => ({ meta: [{ title: "Post a Job — Magic Handshake" }] }),
  component: PostJob,
});

const categories = ["Plumbing", "Electrical", "Cleaning", "Carpentry", "Delivery", "Tech Support", "Other"];

function PostJob() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState({
    title: "Fix leaking kitchen sink",
    category: "Plumbing",
    description: "Slow drip under the sink trap, need replacement and seal.",
    location: "1900 Barton Springs Rd, Austin, TX",
    date: "2026-06-28",
    budget: 240,
    gps: true, photo: true, video: false,
    resolution: "Hybrid",
    pay: "wallet",
  });
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const fee = Math.round(data.budget * 0.02);
  const total = data.budget + fee;

  const handlePostJob = async () => {
    if (!user?.uid) {
      setError("You must be signed in to post a job");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.createJob({
        title: data.title,
        description: data.description,
        category: data.category,
        location: data.location,
        budget: data.budget,
        dueDate: data.date,
        verificationRequirements: {
          gps: data.gps,
          photo: data.photo,
          video: data.video,
        },
        disputeResolution: data.resolution.toUpperCase(),
      });
      navigate({ to: `/job/${result.id}` });
    } catch (err: any) {
      console.error("[v0] Post job error:", err);
      setError(err.message || "Failed to post job");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <div style={{ background: "var(--navy)" }}><SiteNav /></div>
      <main className="flex-1 mx-auto max-w-3xl w-full px-6 py-12">
        <Link to="/" className="text-sm text-slate-500 inline-flex items-center gap-1 mb-4 hover:text-slate-700"><ArrowLeft className="h-4 w-4" /> Back</Link>
        <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Post a Job</h1>
        <p className="text-slate-600 mt-2">Three quick steps. Your payment stays in escrow until the job is verified complete.</p>

        <div className="mt-8 flex items-center gap-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 flex items-center gap-3">
              <div className={`h-8 w-8 rounded-full grid place-items-center text-sm font-bold ${step >= n ? "text-white" : "text-slate-500 bg-slate-200"}`} style={step >= n ? { background: "var(--indigo)" } : undefined}>
                {step > n ? <Check className="h-4 w-4" /> : n}
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider hidden sm:block" style={{ fontFamily: "var(--font-mono)", color: step >= n ? "var(--navy)" : "var(--slate-text)" }}>
                {["Job Details", "Budget & Escrow", "Review & Fund"][n - 1]}
              </div>
              {n < 3 && <div className="flex-1 h-0.5 rounded-full" style={{ background: step > n ? "var(--indigo)" : "#E2E8F0" }} />}
            </div>
          ))}
        </div>

        {error && <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        <div className="mt-8 bg-white rounded-3xl border border-slate-200 p-6 md:p-8">
          {step === 1 && (
            <div className="space-y-5">
              <Field label="Job title">
                <input value={data.title} onChange={e => setData({ ...data, title: e.target.value })} className="input" />
              </Field>
              <Field label="Category">
                <select value={data.category} onChange={e => setData({ ...data, category: e.target.value })} className="input">
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Description">
                <textarea rows={4} value={data.description} onChange={e => setData({ ...data, description: e.target.value })} className="input" />
              </Field>
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Location"><input value={data.location} onChange={e => setData({ ...data, location: e.target.value })} className="input" /></Field>
                <Field label="Preferred date"><input type="date" value={data.date} onChange={e => setData({ ...data, date: e.target.value })} className="input" /></Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <Field label="Budget (USD)">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                  <input type="number" value={data.budget} onChange={e => setData({ ...data, budget: Number(e.target.value) || 0 })} className="input pl-8" />
                </div>
              </Field>

              <div className="rounded-2xl p-4 border" style={{ background: "color-mix(in oklab, var(--cyan-glow) 8%, white)", borderColor: "color-mix(in oklab, var(--cyan-glow) 35%, transparent)" }}>
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "color-mix(in oklab, var(--cyan-glow) 60%, var(--navy))" }} />
                  <p className="text-sm" style={{ color: "var(--navy)" }}>
                    Your payment will be locked in a smart-contract escrow until AI verifies the job is complete. You won't be charged until you confirm and fund.
                  </p>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2" style={{ color: "var(--navy)" }}>Verification requirements</div>
                <div className="grid sm:grid-cols-3 gap-2">
                  {([["gps", "GPS proof"], ["photo", "Photo evidence"], ["video", "Video walkthrough"]] as const).map(([k, l]) => (
                    <Toggle key={k} on={data[k]} onClick={() => setData({ ...data, [k]: !data[k] })} label={l} />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2" style={{ color: "var(--navy)" }}>Dispute resolution</div>
                <div className="grid sm:grid-cols-3 gap-2">
                  {["AI Auto-Resolve", "Human Mediator", "Hybrid"].map(o => (
                    <button key={o} onClick={() => setData({ ...data, resolution: o })}
                      className={`p-3 rounded-xl border text-sm font-semibold transition ${data.resolution === o ? "text-white" : "text-slate-700 bg-white border-slate-200 hover:border-slate-300"}`}
                      style={data.resolution === o ? { background: "var(--indigo)", borderColor: "var(--indigo)" } : undefined}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="rounded-2xl p-5 border border-slate-200">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-3" style={{ fontFamily: "var(--font-mono)" }}>Summary</div>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <Row k="Title" v={data.title} />
                  <Row k="Category" v={data.category} />
                  <Row k="Location" v={data.location} />
                  <Row k="By" v={data.date} />
                  <Row k="Verification" v={[data.gps && "GPS", data.photo && "Photo", data.video && "Video"].filter(Boolean).join(" · ") || "None"} />
                  <Row k="Resolution" v={data.resolution} />
                </div>
              </div>

              <div className="rounded-2xl p-5" style={{ background: "var(--navy)", color: "white" }}>
                <div className="flex justify-between text-sm text-slate-300"><span>Budget</span><span>${data.budget.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm text-slate-300 mt-1"><span>Platform fee (2%)</span><span>${fee}</span></div>
                <div className="border-t border-white/10 mt-3 pt-3 flex justify-between text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  <span>Escrow funding total</span><span>${total}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
                  <span>Smart contract</span>
                  <HashChip hash="0x9aE2c0F1b3D74e5Aa12f0eB7c84d5cFa0bF5ff31" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {([["wallet", Wallet, "Connect Wallet"], ["card", CreditCard, "Pay via Card"]] as const).map(([k, Icon, l]) => (
                  <button key={k} onClick={() => setData({ ...data, pay: k })}
                    className={`p-4 rounded-2xl border flex items-center gap-3 transition ${data.pay === k ? "border-transparent text-white" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}
                    style={data.pay === k ? { background: "var(--indigo)" } : undefined}>
                    <Icon className="h-5 w-5" /> <span className="font-semibold">{l}</span>
                  </button>
                ))}
              </div>

              <button onClick={handlePostJob} disabled={loading} className="btn-pill-primary w-full justify-center py-4 text-base disabled:opacity-50">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating job...</> : <><Lock className="h-4 w-4" /> Post Job & Fund Escrow ${total}</>}
              </button>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="text-sm text-slate-500 disabled:opacity-40 inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" /> Back</button>
            {step < 3 ? (
              <button onClick={() => setStep(step + 1)} className="btn-pill-primary text-sm">Continue <ArrowRight className="h-4 w-4" /></button>
            ) : <span />}
          </div>
        </div>
      </main>
      <SiteFooter />
      <style>{`.input{width:100%;padding:0.7rem 1rem;border:1px solid #E2E8F0;border-radius:0.875rem;background:white;color:var(--navy);outline:none;transition:all .2s}.input:focus{border-color:var(--indigo);box-shadow:0 0 0 3px color-mix(in oklab, var(--indigo) 20%, transparent)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-semibold mb-1.5" style={{ color: "var(--navy)" }}>{label}</div>
      {children}
    </label>
  );
}
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`p-3 rounded-xl border text-sm font-semibold flex items-center justify-between ${on ? "text-white" : "text-slate-700 bg-white border-slate-200"}`}
      style={on ? { background: "var(--indigo)", borderColor: "var(--indigo)" } : undefined}>
      {label}
      <span className={`h-5 w-9 rounded-full relative transition ${on ? "bg-white/30" : "bg-slate-200"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-4" : "left-0.5"}`} />
      </span>
    </button>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div><div className="text-xs text-slate-500" style={{ fontFamily: "var(--font-mono)" }}>{k}</div><div className="font-semibold" style={{ color: "var(--navy)" }}>{v}</div></div>;
}
