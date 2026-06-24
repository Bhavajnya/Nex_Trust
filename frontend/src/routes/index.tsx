import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Camera, CheckCircle2, Lock, MapPin, Search, ShieldCheck, Sparkles, Star, Wallet, Zap } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { HeroOrbs, ScoreRing, SectionLabel } from "@/components/ui-bits";
import { testimonials } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NexTrust — Work Done. Trust Verified. Payment Protected." },
      { name: "description", content: "AI-verified jobs and blockchain-secured escrow payments for local services and freelance work." },
      { property: "og:title", content: "NexTrust" },
      { property: "og:description", content: "AI-verified jobs. Blockchain-secured payments. Zero disputes." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen flex flex-col">
      <div style={{ background: "var(--navy)" }}>
        <SiteNav />
        <Hero />
      </div>
      <HowItWorks />
      <ForCustomers />
      <ForWorkers />
      <TrustSecurity />
      <Testimonials />
      <CTABanner />
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden text-white">
      <HeroOrbs />
      <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-28 grid lg:grid-cols-2 gap-12 items-center">
        <div className="animate-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-white/15 text-slate-200" style={{ background: "color-mix(in oklab, white 5%, transparent)" }}>
            <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--cyan-glow)" }} /> Now live in 38 cities
          </div>
          <h1 className="mt-5 text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05]" style={{ fontFamily: "var(--font-display)" }}>
            The Future of <span style={{ color: "var(--cyan-glow)" }}>Trusted Work</span> is Here
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-300 max-w-xl leading-relaxed">
            AI-verified jobs. Blockchain-secured payments. Zero disputes. NexTrust puts trust back into every transaction.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/post-job" className="btn-pill-primary">Post a Job <Zap className="h-4 w-4" /></Link>
            <Link to="/dashboard/worker" className="btn-pill-ghost">Find Work <Search className="h-4 w-4" /></Link>
          </div>
          <div className="mt-10 grid grid-cols-3 gap-4 max-w-lg">
            {[
              { v: "12,400+", l: "Jobs Completed", i: CheckCircle2 },
              { v: "$3.2M", l: "Secured in Escrow", i: Lock },
              { v: "99.1%", l: "Dispute-Free Rate", i: ShieldCheck },
            ].map((s) => (
              <div key={s.l}>
                <s.i className="h-4 w-4 mb-1" style={{ color: "var(--cyan-glow)" }} />
                <div className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{s.v}</div>
                <div className="text-xs text-slate-400">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6 animate-fade-up" style={{ animationDelay: "0.15s" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--cyan-glow)" }} />
              Live Verification Feed
            </div>
            <span className="text-xs text-slate-300" style={{ fontFamily: "var(--font-mono)" }}>updated 2s ago</span>
          </div>
          <div className="space-y-3">
            {[
              { icon: "✅", title: "Plumbing job #4821", meta: "AI Verified · Payment Released $240" },
              { icon: "⏳", title: "Garden cleanup #3942", meta: "GPS Confirmed · Awaiting Final Photo" },
              { icon: "🤖", title: "TV mount #4790", meta: "AI Analyzing 4 photos · 87% match" },
              { icon: "💸", title: "Deep clean #4755", meta: "Smart contract released $320" },
            ].map((row) => (
              <div key={row.title} className="flex items-start gap-3 p-3 rounded-xl border border-white/10" style={{ background: "color-mix(in oklab, white 6%, transparent)" }}>
                <div className="h-9 w-9 grid place-items-center rounded-lg shrink-0" style={{ background: "color-mix(in oklab, var(--cyan-glow) 18%, transparent)" }}>
                  <span className="text-base">{row.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{row.title}</div>
                  <div className="text-xs text-slate-300 truncate">{row.meta}</div>
                </div>
                <span className="font-mono-chip shrink-0" style={{ fontFamily: "var(--font-mono)" }}>0x4f2a…d91c</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Lock, title: "Post & Fund Escrow", text: "Customer posts the job, funds are locked in smart-contract escrow. The worker sees a verified budget before they start." },
    { icon: Camera, title: "AI Work Verification", text: "Worker submits real-time GPS, timestamped photos and videos. Our AI checks quality, location, and completion." },
    { icon: Zap, title: "Instant Payment Release", text: "On AI approval, the smart contract releases funds to the worker instantly. No waiting. No disputes." },
  ];
  return (
    <section id="how" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <SectionLabel>The Process</SectionLabel>
        <h2 className="mt-3 text-4xl md:text-5xl font-bold max-w-2xl" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>
          Three Steps to Stress-Free Hiring
        </h2>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <div key={s.title} className="relative p-7 rounded-3xl bg-white border border-slate-200 hover:shadow-xl transition">
              <div className="absolute -top-3 left-7 text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ background: "var(--indigo)", fontFamily: "var(--font-mono)" }}>0{i + 1}</div>
              <div className="h-12 w-12 grid place-items-center rounded-2xl mb-5" style={{ background: "color-mix(in oklab, var(--indigo) 12%, white)" }}>
                <s.icon className="h-6 w-6" style={{ color: "var(--indigo)" }} />
              </div>
              <h3 className="text-xl font-bold mb-2" style={{ color: "var(--navy)" }}>{s.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ForCustomers() {
  const points = [
    "Funds held in escrow until job is verified complete",
    "AI reviews photo and video evidence before releasing payment",
    "Transparent dispute resolution — no he-said-she-said",
    "Full audit trail on blockchain — immutable and tamper-proof",
  ];
  return (
    <section className="py-24" style={{ background: "#F1F5F9" }}>
      <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <SectionLabel>For Customers</SectionLabel>
          <h2 className="mt-3 text-4xl md:text-5xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>
            You're Protected. Always.
          </h2>
          <ul className="mt-8 space-y-4">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--cyan-glow)" }} />
                <span className="text-slate-700">{p}</span>
              </li>
            ))}
          </ul>
          <Link to="/post-job" className="btn-pill-primary mt-8 inline-flex">Post Your First Job</Link>
        </div>
        <PhoneArt />
      </div>
    </section>
  );
}

function PhoneArt() {
  return (
    <div className="relative mx-auto w-full max-w-sm aspect-[9/16]">
      <div className="absolute inset-0 rounded-[3rem] shadow-2xl border-[10px] border-slate-900" style={{ background: "linear-gradient(160deg, #0A0F2C, #1e1e5a)" }}>
        <div className="absolute inset-0 rounded-[2.25rem] p-6 flex flex-col">
          <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--cyan-glow)", fontFamily: "var(--font-mono)" }}>Job #4821</div>
          <div className="text-white text-lg font-bold mt-1" style={{ fontFamily: "var(--font-display)" }}>Fix leaking sink</div>
          <div className="mt-4 mx-auto h-32 w-32 rounded-full grid place-items-center" style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--cyan-glow) 35%, transparent), transparent 70%)" }}>
            <div className="h-20 w-20 rounded-full grid place-items-center" style={{ background: "color-mix(in oklab, var(--cyan-glow) 30%, var(--navy))", boxShadow: "0 0 40px color-mix(in oklab, var(--cyan-glow) 50%, transparent)" }}>
              <ShieldCheck className="h-10 w-10 text-white" />
            </div>
          </div>
          <div className="text-center mt-4 text-white font-semibold">AI Verified</div>
          <div className="text-center text-xs text-slate-300">3 photos · GPS match · 98% confidence</div>
          <div className="mt-auto rounded-2xl p-3 border border-white/10" style={{ background: "color-mix(in oklab, white 5%, transparent)" }}>
            <div className="text-[10px] uppercase tracking-wider text-slate-300" style={{ fontFamily: "var(--font-mono)" }}>Payment released</div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-white text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>$240.00</span>
              <span className="font-mono-chip" style={{ fontFamily: "var(--font-mono)" }}>0x3f4a…c821</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ForWorkers() {
  const points = [
    "No more payment delays or fake disputes",
    "Smart contract pays you the moment work is verified",
    "Build your on-chain reputation score with every job",
    "GPS and timestamp proof protects you from false claims",
  ];
  return (
    <section className="py-24 relative overflow-hidden text-white" style={{ background: "var(--navy)" }}>
      <HeroOrbs />
      <div className="relative mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-12 items-center">
        <div className="glass-card p-8 order-2 lg:order-1">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-300" style={{ fontFamily: "var(--font-mono)" }}>Reputation score</div>
              <div className="text-5xl font-bold mt-1" style={{ fontFamily: "var(--font-display)" }}>94<span className="text-slate-400 text-2xl">/100</span></div>
            </div>
            <ScoreRing value={94} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            {[["Completion", "98%"], ["Rating", "4.9 ⭐"], ["Disputes", "0%"], ["Evidence", "96%"]].map(([k, v]) => (
              <div key={k} className="p-3 rounded-xl border border-white/10" style={{ background: "color-mix(in oklab, white 4%, transparent)" }}>
                <div className="text-slate-400 text-xs">{k}</div>
                <div className="font-bold text-white">{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <SectionLabel>For Workers</SectionLabel>
          <h2 className="mt-3 text-4xl md:text-5xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Get Paid Fast. Every Time.</h2>
          <ul className="mt-8 space-y-4">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-slate-200">
                <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--emerald-brand)" }} />
                {p}
              </li>
            ))}
          </ul>
          <Link to="/sign-up" className="btn-pill-ghost mt-8 inline-flex">Start Earning</Link>
        </div>
      </div>
    </section>
  );
}

function TrustSecurity() {
  const items = [
    { icon: ShieldCheck, t: "Smart Contract Escrow", d: "Funds locked on-chain, released only on verified completion." },
    { icon: Bot, t: "AI Work Verification", d: "Computer vision checks your submitted photos and GPS data." },
    { icon: Sparkles, t: "Fraud Detection", d: "Real-time ML flags suspicious activity before it becomes a problem." },
    { icon: Search, t: "Transparent Disputes", d: "Every decision logged on-chain with evidence. No hidden decisions." },
  ];
  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <SectionLabel>Trust & Security</SectionLabel>
            <h2 className="mt-3 text-4xl md:text-5xl font-bold max-w-2xl" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>
              Built on Proof, Not Promises
            </h2>
          </div>
          <span className="font-mono-chip" style={{ fontFamily: "var(--font-mono)" }}>Smart contract: 0x9aE2…ff31</span>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 gap-5">
          {items.map((it) => (
            <div key={it.t} className="p-7 rounded-3xl border border-slate-200 bg-white hover:shadow-xl transition group">
              <div className="h-12 w-12 grid place-items-center rounded-2xl mb-4 transition group-hover:scale-105" style={{ background: "color-mix(in oklab, var(--cyan-glow) 14%, white)", boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--cyan-glow) 35%, transparent)" }}>
                <it.icon className="h-6 w-6" style={{ color: "color-mix(in oklab, var(--cyan-glow) 70%, var(--navy))" }} />
              </div>
              <h3 className="font-bold text-lg mb-1" style={{ color: "var(--navy)" }}>{it.t}</h3>
              <p className="text-sm text-slate-600">{it.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section className="py-24" style={{ background: "#F1F5F9" }}>
      <div className="mx-auto max-w-7xl px-6">
        <SectionLabel>Loved by both sides</SectionLabel>
        <h2 className="mt-3 text-4xl md:text-5xl font-bold max-w-2xl" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>
          Customers and workers, on the same page.
        </h2>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-white rounded-2xl p-6 shadow-sm border-l-4" style={{ borderColor: "var(--indigo)" }}>
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" style={{ color: "var(--amber-brand)" }} />)}
              </div>
              <p className="text-slate-700 leading-relaxed">"{t.quote}"</p>
              <div className="mt-5 pt-5 border-t border-slate-100">
                <div className="font-bold" style={{ color: "var(--navy)" }}>{t.name}</div>
                <div className="text-xs text-slate-500">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTABanner() {
  return (
    <section className="py-20" style={{ background: "linear-gradient(135deg, var(--navy), #1e1e5a 60%, var(--indigo))" }}>
      <div className="mx-auto max-w-5xl px-6 text-center text-white">
        <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Ready to Work With Confidence?</h2>
        <p className="mt-4 text-slate-200 max-w-2xl mx-auto">Sign up in under a minute. Connect a wallet later — or pay by card. Either way, the trust layer is on us.</p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link to="/post-job" className="btn-pill-primary"><Wallet className="h-4 w-4" /> I Need a Worker</Link>
          <Link to="/dashboard/worker" className="btn-pill-ghost"><MapPin className="h-4 w-4" /> I'm a Worker</Link>
        </div>
      </div>
    </section>
  );
}