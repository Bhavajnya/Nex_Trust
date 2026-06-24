import { Lock, Shield } from "lucide-react";

export function SiteFooter() {
  const cols = [
    { title: "Product", links: ["How It Works", "For Customers", "For Workers", "Pricing", "Integrations"] },
    { title: "Company", links: ["About", "Careers", "Press", "Contact"] },
    { title: "Legal", links: ["Terms", "Privacy", "Smart Contract Audit", "Compliance"] },
    { title: "Support", links: ["Help Center", "Disputes", "Status", "Security"] },
  ];
  return (
    <footer className="text-slate-300" style={{ background: "var(--navy)" }}>
      <div className="mx-auto max-w-7xl px-6 py-16 grid grid-cols-2 md:grid-cols-6 gap-10">
        <div className="col-span-2">
          <div className="flex items-center gap-2 text-white font-bold text-lg" style={{fontFamily:"var(--font-display)"}}>
            <Shield className="h-5 w-5" style={{color:"var(--cyan-glow)"}} /> NexTrust
          </div>
          <p className="mt-3 text-sm max-w-xs leading-relaxed">
            AI-verified work. Blockchain-secured payments. Built so every job ends with trust intact.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="text-white font-semibold text-sm mb-3">{c.title}</div>
            <ul className="space-y-2 text-sm">
              {c.links.map((l) => <li key={l}><a className="hover:text-white" href="#">{l}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-2"><Lock className="h-3.5 w-3.5" /> © 2026 NexTrust. Secured by Blockchain. Verified by AI.</span>
          <span style={{fontFamily:"var(--font-mono)"}}>v1.0.0 · audit-ok</span>
        </div>
      </div>
    </footer>
  );
}