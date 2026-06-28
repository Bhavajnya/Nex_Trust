import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CreditCard, Lock, Shield, Wallet, Loader2, PlusCircle, CheckCircle2 } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { HashChip } from "@/components/ui-bits";
import { api } from "../lib/api";
import { useAuthContext } from "../context/AuthContext";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/post-job")({
  head: () => ({ meta: [{ title: "Post a Job — NexTrust" }] }),
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
      <main className="flex-1 mx-auto max-w-4xl w-full px-6 py-12">
        <Link to="/dashboard/customer" className="text-sm font-semibold text-slate-500 inline-flex items-center gap-1 mb-6 hover:text-indigo-600 transition-colors group">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back to Dashboard
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Post a New Job</h1>
            <p className="text-slate-500 mt-2 text-lg">Set details and fund the escrow to start receiving proposals.</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-sm">
            <Shield className="h-4 w-4" />
            AI Verified Escrow
          </div>
        </div>

        {/* Stepper */}
        <div className="mb-12 flex items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 flex items-center gap-4">
              <div className={`h-10 w-10 rounded-2xl grid place-items-center text-sm font-bold transition-all duration-300 ${step >= n ? "text-white shadow-lg" : "text-slate-400 bg-slate-100"}`} 
                style={step >= n ? { background: "var(--indigo)", shadowColor: "rgba(79, 70, 229, 0.4)" } : undefined}>
                {step > n ? <CheckCircle2 className="h-5 w-5" /> : n}
              </div>
              <div className="flex flex-col">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Step 0{n}</div>
                <div className={`text-sm font-bold truncate ${step >= n ? "text-slate-900" : "text-slate-400"}`} style={{ fontFamily: "var(--font-display)" }}>
                  {["Job Details", "Budget & Verification", "Review & Fund"][n - 1]}
                </div>
              </div>
              {n < 3 && <div className="flex-1 h-0.5 rounded-full bg-slate-100 hidden md:block" />}
            </div>
          ))}
        </div>

        {error && <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 animate-fade-up flex items-center gap-3">
          <Shield className="h-5 w-5 shrink-0" />
          {error}
        </div>}

        <div className="bg-white rounded-[2rem] border border-slate-200 p-8 md:p-12 shadow-xl shadow-slate-200/50">
          {step === 1 && (
            <div className="space-y-6 animate-fade-up">
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="Job Title" description="What do you need help with?">
                  <input value={data.title} onChange={e => setData({ ...data, title: e.target.value })} className="input-modern" placeholder="e.g. Emergency Plumber Needed" />
                </Field>
                <Field label="Category" description="Choose a service area">
                  <select value={data.category} onChange={e => setData({ ...data, category: e.target.value })} className="input-modern">
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Full Description" description="Be specific to help workers provide accurate bids">
                <textarea rows={5} value={data.description} onChange={e => setData({ ...data, description: e.target.value })} className="input-modern py-4" placeholder="Describe the job in detail..." />
              </Field>
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="Location" description="Street address or area">
                  <input value={data.location} onChange={e => setData({ ...data, location: e.target.value })} className="input-modern" placeholder="Austin, TX" />
                </Field>
                <Field label="Preferred Date" description="When should the job start?">
                  <input type="date" value={data.date} onChange={e => setData({ ...data, date: e.target.value })} className="input-modern" />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-fade-up">
              <Field label="Budget (USD)" description="Total amount to be put in escrow">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input type="number" value={data.budget} onChange={e => setData({ ...data, budget: Number(e.target.value) || 0 })} className="input-modern pl-10 text-2xl font-bold" />
                </div>
              </Field>

              <div className="p-6 rounded-3xl bg-slate-900 text-white relative overflow-hidden group shadow-2xl">
                <div className="relative z-10 flex items-start gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center shrink-0 border border-indigo-500/30">
                    <ShieldCheck className="h-6 w-6 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-1" style={{ fontFamily: "var(--font-display)" }}>NexTrust Smart Escrow</h4>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      Your funds are cryptographically locked. Payment is only released when AI verification matches your requirements and you confirm the work.
                    </p>
                  </div>
                </div>
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
              </div>

              <div className="space-y-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>AI Verification Requirements</span>
                  <span className="text-xs text-slate-500 mt-0.5">What evidence must the worker provide to release funds?</span>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  {([["gps", "GPS proof"], ["photo", "Photo evidence"], ["video", "Video walk"]] as const).map(([k, l]) => (
                    <Toggle key={k} on={data[k]} onClick={() => setData({ ...data, [k]: !data[k] })} label={l} />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Dispute Resolution Mode</span>
                  <span className="text-xs text-slate-500 mt-0.5">How should conflicts be handled?</span>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  {["AI Auto-Resolve", "Human Mediator", "Hybrid"].map(o => (
                    <button key={o} onClick={() => setData({ ...data, resolution: o })}
                      className={`p-4 rounded-2xl border text-sm font-bold transition-all duration-300 ${data.resolution === o ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600"}`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-fade-up">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h3 className="font-bold text-lg" style={{ fontFamily: "var(--font-display)" }}>Job Summary</h3>
                  <div className="space-y-4 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <Row k="Title" v={data.title} />
                    <Row k="Category" v={data.category} />
                    <Row k="Requirements" v={[data.gps && "GPS", data.photo && "Photo", data.video && "Video"].filter(Boolean).join(" · ") || "None"} />
                    <Row k="Location" v={data.location} />
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="font-bold text-lg" style={{ fontFamily: "var(--font-display)" }}>Funding Details</h3>
                  <div className="bg-white rounded-3xl border-2 border-slate-100 p-6 shadow-sm overflow-hidden relative">
                    <div className="space-y-3 relative z-10">
                      <div className="flex justify-between text-sm text-slate-500"><span>Job Budget</span><span className="font-bold text-slate-900">${data.budget}</span></div>
                      <div className="flex justify-between text-sm text-slate-500"><span>Platform Fee (2%)</span><span className="font-bold text-slate-900">${fee}</span></div>
                      <div className="pt-3 border-t border-slate-100 flex justify-between text-2xl font-bold text-indigo-600">
                        <span>Total Escrow</span><span>${total}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 text-[10px] font-mono text-indigo-700">
                    <span>CONTRACT: 0x9aE2...F5ff31</span>
                    <Lock className="h-3 w-3" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Payment Method</span>
                <div className="grid grid-cols-2 gap-4">
                  {([["wallet", Wallet, "Web3 Wallet"], ["card", CreditCard, "Debit/Credit"]] as const).map(([k, Icon, l]) => (
                    <button key={k} onClick={() => setData({ ...data, pay: k })}
                      className={`p-5 rounded-2xl border-2 flex items-center gap-4 transition-all duration-300 ${data.pay === k ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-100 text-slate-500 hover:border-slate-200"}`}>
                      <Icon className="h-6 w-6" /> <span className="font-bold">{l}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={handlePostJob} disabled={loading} className="btn-pill-primary w-full py-8 text-lg group">
                {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Initializing Smart Contract...</> : <><PlusCircle className="h-5 w-5 transition-transform group-hover:rotate-90" /> Post Job & Fund Escrow</>}
              </Button>
            </div>
          )}

          <div className="mt-12 pt-8 border-t border-slate-100 flex items-center justify-between">
            <button 
              onClick={() => setStep(Math.max(1, step - 1))} 
              disabled={step === 1 || loading} 
              className="text-sm font-bold text-slate-400 disabled:opacity-30 flex items-center gap-2 hover:text-slate-600 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Previous Step
            </button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} className="btn-pill-ghost px-8">
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : <span />}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col ml-1">
        <label className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>{label}</label>
        {description && <span className="text-xs text-slate-500">{description}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`p-4 rounded-2xl border text-sm font-bold flex items-center justify-between transition-all duration-300 ${on ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
      {label}
      <div className={`h-5 w-10 rounded-full relative transition-colors duration-300 ${on ? "bg-indigo-600" : "bg-slate-200"}`}>
        <div className={`absolute top-1 h-3 w-3 rounded-full bg-white transition-all duration-300 ${on ? "left-6" : "left-1"}`} />
      </div>
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{k}</span>
      <span className="text-sm font-bold text-slate-900 truncate">{v}</span>
    </div>
  );
}

