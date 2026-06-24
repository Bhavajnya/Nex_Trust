import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Briefcase, Shield, User, Loader2 } from "lucide-react";
import { useAuthContext } from "../context/AuthContext";

export const Route = createFileRoute("/sign-up")({
  head: () => ({ meta: [{ title: "Sign up — Magic Handshake" }] }),
  component: SignUp,
});

function SignUp() {
  const [role, setRole] = useState<"customer" | "worker" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", password: "", skill: "Plumbing" });
  const { register } = useAuthContext();
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (!formData.name || !formData.email || !formData.password || !role) {
      setError("Please fill in all fields and select a role");
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[SignUp] Starting registration for:', formData.email, 'Role:', role);
      const result = await register(formData.email, formData.password, formData.name, role);

      console.log('[SignUp] Registration result:', result);

      if (!result.success) {
        const errMsg = result.error || "Sign up failed";
        console.error('[SignUp] Registration failed:', errMsg);
        setError(errMsg);
        setLoading(false);
        return;
      }

      console.log('[SignUp] Registration successful! User:', result.user?.uid);

      // Wait briefly for auth state to settle
      await new Promise(resolve => setTimeout(resolve, 1000));

      const dashboard = role === "customer" ? "/dashboard/customer" : "/dashboard/worker";
      console.log('[SignUp] Navigating to:', dashboard);
      navigate({ to: dashboard });
    } catch (err: any) {
      const errMsg = err.message || "Sign up failed";
      console.error("[SignUp] Unexpected error:", err);
      setError(errMsg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <header className="px-6 py-5 border-b bg-white">
        <Link to="/" className="inline-flex items-center gap-2 font-bold text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>
          <Shield className="h-5 w-5" style={{ color: "var(--indigo)" }} /> Magic Handshake
        </Link>
      </header>
      <main className="flex-1 mx-auto max-w-2xl w-full px-6 py-12">
        {!role ? (
          <>
            <h1 className="text-3xl md:text-4xl font-bold text-center" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>How will you use Magic Handshake?</h1>
            <p className="text-center text-slate-600 mt-2">You can switch later — your reputation travels with you.</p>
            <div className="mt-10 grid sm:grid-cols-2 gap-5">
              {([["customer", User, "I need a worker", "Post jobs, fund escrow, and get AI-verified work."],
                ["worker", Briefcase, "I'm a worker", "Find jobs, submit evidence, and get paid instantly."]] as const).map(([k, Icon, t, d]) => (
                <button key={k} onClick={() => setRole(k)}
                  className="text-left rounded-3xl p-6 border-2 border-slate-200 bg-white hover:border-indigo-400 hover:shadow-xl transition group">
                  <div className="h-12 w-12 grid place-items-center rounded-2xl mb-4 transition group-hover:scale-110" style={{ background: "color-mix(in oklab, var(--indigo) 12%, white)" }}>
                    <Icon className="h-6 w-6" style={{ color: "var(--indigo)" }} />
                  </div>
                  <div className="text-xl font-bold" style={{ color: "var(--navy)", fontFamily: "var(--font-display)" }}>{t}</div>
                  <p className="mt-2 text-sm text-slate-600">{d}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 p-8">
            <button onClick={() => setRole(null)} className="text-sm text-slate-500 inline-flex items-center gap-1 mb-4"><ArrowLeft className="h-4 w-4" /> Change role</button>
            <div className="text-xs uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--cyan-glow)" }}>{role === "customer" ? "Customer signup" : "Worker signup"}</div>
            <h1 className="text-3xl font-bold mt-1" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Create your account</h1>
            {error && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
            <form onSubmit={handleSignUp} className="mt-6 space-y-3">
              <input 
                className="input" 
                placeholder="Full name" 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                required 
              />
              <input 
                className="input" 
                type="email" 
                placeholder="you@email.com" 
                value={formData.email} 
                onChange={(e) => setFormData({...formData, email: e.target.value})} 
                required 
              />
              <input 
                className="input" 
                type="password" 
                placeholder="Password (12+ chars)" 
                value={formData.password} 
                onChange={(e) => setFormData({...formData, password: e.target.value})} 
                required 
              />
              {role === "worker" && (
                <select className="input" value={formData.skill} onChange={(e) => setFormData({...formData, skill: e.target.value})}>
                  <option>Plumbing</option>
                  <option>Electrical</option>
                  <option>Cleaning</option>
                  <option>Carpentry</option>
                  <option>Delivery</option>
                  <option>Tech Support</option>
                </select>
              )}
              <button type="submit" disabled={loading} className="btn-pill-primary w-full justify-center mt-4 disabled:opacity-50">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing up...</> : "Create account"}
              </button>
            </form>
            <p className="text-xs text-slate-500 mt-4 text-center">By signing up you agree to our Terms and Privacy.</p>
          </div>
        )}
      </main>
      <style>{`.input{width:100%;padding:0.7rem 1rem;border:1px solid #E2E8F0;border-radius:0.875rem;background:white;color:var(--navy);outline:none;transition:all .2s}.input:focus{border-color:var(--indigo);box-shadow:0 0 0 3px color-mix(in oklab, var(--indigo) 20%, transparent)}`}</style>
    </div>
  );
}
