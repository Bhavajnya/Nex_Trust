import { createFileRoute } from "@tanstack/react-router";
import { Award, Bot, Camera, CheckCircle2, Lock, Shield, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { HeroOrbs, SectionLabel } from "@/components/ui-bits";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — NexTrust" },
      { name: "description", content: "The team, mission, and security behind NexTrust." },
    ],
  }),
  component: AboutPage,
});

const team = [
  { name: "Priya Anand", role: "Co-founder & CEO", bio: "Former Stripe payments lead." },
  { name: "Daniel Okafor", role: "Co-founder & CTO", bio: "Built ML fraud systems at Coinbase." },
  { name: "Mei Tanaka", role: "Head of Trust", bio: "10 yrs in marketplace dispute design." },
  { name: "Jorge Salinas", role: "Head of Smart Contracts", bio: "ex-OpenZeppelin auditor." },
];

function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div style={{ background: "var(--navy)" }}>
        <SiteNav />
        <section className="relative overflow-hidden text-white">
          <HeroOrbs />
          <div className="relative mx-auto max-w-5xl px-6 py-24 text-center">
            <SectionLabel>Our mission</SectionLabel>
            <h1 className="mt-4 text-5xl md:text-6xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
              Make every transaction <span style={{ color: "var(--cyan-glow)" }}>trustworthy by default</span>.
            </h1>
            <p className="mt-5 text-slate-300 text-lg max-w-2xl mx-auto">
              Local services and freelance work shouldn't require blind faith. NexTrust combines AI verification and on-chain escrow so customers and workers never have to wonder whether the other side will keep their word.
            </p>
          </div>
        </section>
      </div>

      <section className="py-20 bg-white">
        <div className="mx-auto max-w-6xl px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <SectionLabel>How AI verification works</SectionLabel>
            <h2 className="mt-3 text-3xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Photos in. Proof out.</h2>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              <li className="flex gap-3"><Camera className="h-5 w-5 shrink-0" style={{ color: "var(--cyan-glow)" }} /> Worker uploads timestamped photos / video with embedded GPS.</li>
              <li className="flex gap-3"><Bot className="h-5 w-5 shrink-0" style={{ color: "var(--cyan-glow)" }} /> Vision model compares evidence to the job brief and prior site photos.</li>
              <li className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0" style={{ color: "var(--cyan-glow)" }} /> Fraud model checks for tampering, duplication, and replay attacks.</li>
              <li className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "var(--cyan-glow)" }} /> Confidence + verdict written to the dispute ledger before payout.</li>
            </ul>
          </div>
          <Flow />
        </div>
      </section>

      <section className="py-20" style={{ background: "#F1F5F9" }}>
        <div className="mx-auto max-w-6xl px-6 grid lg:grid-cols-2 gap-12 items-center">
          <EscrowFlow />
          <div className="order-first lg:order-last">
            <SectionLabel>How blockchain escrow works</SectionLabel>
            <h2 className="mt-3 text-3xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Money parked in a smart contract — not our bank.</h2>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              <li className="flex gap-3"><Wallet className="h-5 w-5 shrink-0" style={{ color: "var(--indigo)" }} /> Customer funds escrow at job creation. The contract address is public.</li>
              <li className="flex gap-3"><Lock className="h-5 w-5 shrink-0" style={{ color: "var(--indigo)" }} /> Funds can only release when both AI verdict and dispute rules pass.</li>
              <li className="flex gap-3"><Sparkles className="h-5 w-5 shrink-0" style={{ color: "var(--indigo)" }} /> Every state change emits an event you can audit on-chain.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <SectionLabel>The team</SectionLabel>
          <h2 className="mt-3 text-3xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>People who've shipped trust at scale.</h2>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {team.map(p => (
              <div key={p.name} className="rounded-2xl border border-slate-200 p-5 bg-white">
                <div className="h-14 w-14 rounded-full grid place-items-center text-white font-bold text-lg" style={{ background: "linear-gradient(135deg, var(--indigo), var(--cyan-glow))" }}>
                  {p.name.split(" ").map(s => s[0]).join("")}
                </div>
                <div className="mt-4 font-bold" style={{ color: "var(--navy)" }}>{p.name}</div>
                <div className="text-xs" style={{ color: "var(--indigo)", fontFamily: "var(--font-mono)" }}>{p.role}</div>
                <p className="mt-2 text-sm text-slate-600">{p.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20" style={{ background: "var(--navy)" }}>
        <div className="mx-auto max-w-6xl px-6 text-center text-white">
          <SectionLabel>Security certifications</SectionLabel>
          <h2 className="mt-3 text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Audited, encrypted, accountable.</h2>
          <div className="mt-10 flex flex-wrap gap-4 justify-center">
            {[
              { i: Shield, t: "SOC 2 Type II" },
              { i: Lock, t: "AES-256 at rest" },
              { i: Award, t: "Smart Contract Audited" },
              { i: ShieldCheck, t: "GDPR Compliant" },
            ].map(b => (
              <div key={b.t} className="glass-card px-5 py-4 flex items-center gap-3 text-white">
                <b.i className="h-5 w-5" style={{ color: "var(--cyan-glow)" }} /> <span className="font-semibold">{b.t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Flow() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6">
      {[
        { i: Camera, t: "Evidence Submitted" },
        { i: Bot, t: "AI Vision + Fraud Models" },
        { i: CheckCircle2, t: "Verdict + Confidence Score" },
        { i: Lock, t: "Smart Contract Payout" },
      ].map((s, idx, arr) => (
        <div key={s.t}>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
            <div className="h-10 w-10 grid place-items-center rounded-xl text-white" style={{ background: "var(--indigo)" }}>
              <s.i className="h-5 w-5" />
            </div>
            <div className="font-semibold" style={{ color: "var(--navy)" }}>{s.t}</div>
          </div>
          {idx < arr.length - 1 && <div className="h-6 ml-9 border-l-2 border-dashed border-slate-300" />}
        </div>
      ))}
    </div>
  );
}
function EscrowFlow() {
  return (
    <div className="rounded-3xl p-6 text-white" style={{ background: "linear-gradient(135deg, var(--navy), #1e1e5a)" }}>
      <div className="text-xs uppercase tracking-widest" style={{ color: "var(--cyan-glow)", fontFamily: "var(--font-mono)" }}>Escrow lifecycle</div>
      {["FUND →", "LOCK →", "VERIFY →", "RELEASE"].map((s) => (
        <div key={s} className="mt-3 p-4 rounded-2xl border border-white/10 flex items-center justify-between" style={{ background: "color-mix(in oklab, white 5%, transparent)" }}>
          <span className="font-bold text-lg" style={{ fontFamily: "var(--font-display)" }}>{s}</span>
          <span className="font-mono-chip" style={{ fontFamily: "var(--font-mono)" }}>0x9aE2…ff31</span>
        </div>
      ))}
    </div>
  );
}