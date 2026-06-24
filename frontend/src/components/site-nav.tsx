import { Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-white/10" style={{background:"color-mix(in oklab, var(--navy) 75%, transparent)"}}>
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between text-white">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg" style={{fontFamily:"var(--font-display)"}}>
          <span className="grid place-items-center h-9 w-9 rounded-xl ring-1" style={{background:"color-mix(in oklab, var(--indigo) 25%, transparent)", boxShadow:"inset 0 0 0 1px color-mix(in oklab, var(--cyan-glow) 40%, transparent)"}}>
            <Shield className="h-5 w-5" style={{color:"var(--cyan-glow)"}} />
          </span>
          NexTrust
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-slate-300">
          <a href="/#how" className="hover:text-white">How It Works</a>
          <Link to="/dashboard/customer" className="hover:text-white">For Customers</Link>
          <Link to="/dashboard/worker" className="hover:text-white">For Workers</Link>
          <a href="/#pricing" className="hover:text-white">Pricing</a>
          <Link to="/about" className="hover:text-white">About</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/sign-in" className="text-sm text-slate-200 hover:text-white px-4 py-2">Sign In</Link>
          <Link to="/sign-up" className="btn-pill-primary text-sm">Get Started Free</Link>
        </div>
      </div>
    </header>
  );
}