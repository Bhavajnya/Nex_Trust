import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Briefcase, ShieldCheck, User, Loader2, ArrowRight, Lock, Bot } from "lucide-react";
import { useAuthContext } from "../context/AuthContext";
import { HeroOrbs } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/sign-up")({
  head: () => ({ meta: [{ title: "Sign up — NexTrust" }] }),
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

      if (!result.success) {
        const errMsg = result.error || "Sign up failed";
        setError(errMsg);
        setLoading(false);
        return;
      }

      // Wait briefly for auth state to settle
      await new Promise(resolve => setTimeout(resolve, 1000));

      const dashboard = role === "customer" ? "/dashboard/customer" : "/dashboard/worker";
      navigate({ to: dashboard });
    } catch (err: any) {
      const errMsg = err.message || "Sign up failed";
      setError(errMsg);
      setLoading(false);
    }
  };

  const getPasswordStrength = () => {
    const p = formData.password;
    if (!p) return 0;
    let strength = 0;
    if (p.length >= 8) strength++;
    if (/[A-Z]/.test(p)) strength++;
    if (/[0-9]/.test(p)) strength++;
    if (/[^A-Za-z0-9]/.test(p)) strength++;
    return strength;
  };

  const strength = getPasswordStrength();

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden" style={{ background: "var(--navy)" }}>
      <HeroOrbs />

      <main className="relative z-10 w-full max-w-lg animate-fade-up">
        <div className="glass-card p-8 md:p-12 border border-white/10 shadow-2xl">
          
          {/* Header */}
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 p-[1px] mb-4">
              <div className="h-full w-full rounded-2xl bg-[#0A0F2C] flex items-center justify-center">
                <ShieldCheck className="h-8 w-8 text-cyan-400" />
              </div>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white mb-2">Join NexTrust</h1>
            <p className="text-slate-400 text-sm">Secure escrow for every handshake, powered by AI.</p>
          </div>

          {!role ? (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-center text-white mb-6">How will you use NexTrust?</h2>
              <div className="grid gap-4">
                <button onClick={() => setRole("customer")} className="text-left rounded-3xl p-6 border border-white/10 bg-white/5 hover:bg-white/10 hover:border-indigo-500/50 transition-all duration-300 group">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 grid place-items-center rounded-2xl bg-indigo-500/20 text-indigo-400 group-hover:scale-110 transition-transform">
                      <User className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">I need a worker</div>
                      <p className="text-xs text-slate-400">Post jobs and protect your payments.</p>
                    </div>
                    <ArrowRight className="h-5 w-5 ml-auto text-white/20 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
                <button onClick={() => setRole("worker")} className="text-left rounded-3xl p-6 border border-white/10 bg-white/5 hover:bg-white/10 hover:border-cyan-500/50 transition-all duration-300 group">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 grid place-items-center rounded-2xl bg-cyan-500/20 text-cyan-400 group-hover:scale-110 transition-transform">
                      <Briefcase className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors">I'm a worker</div>
                      <p className="text-xs text-slate-400">Find jobs and get paid instantly.</p>
                    </div>
                    <ArrowRight className="h-5 w-5 ml-auto text-white/20 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              </div>
              <p className="text-center text-xs text-slate-500 mt-6">
                Already have an account? <Link to="/sign-in" className="text-indigo-400 hover:underline">Sign in</Link>
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2 pb-4 border-b border-white/5">
                <button onClick={() => setRole(null)} className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-400 hover:text-white transition group">
                  <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" /> 
                  <span className="font-mono tracking-widest uppercase">Change Role</span>
                </button>
                <div className="font-mono text-[10px] tracking-[0.2em] text-slate-400 uppercase px-3 py-1 rounded-full bg-white/5 border border-white/5">
                  Step 02: {role} Profile
                </div>
              </div>

              {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 animate-fade-up">{error}</div>}

              <form onSubmit={handleSignUp} className="space-y-5 animate-fade-up">
                <div className="space-y-1.5">
                  <label htmlFor="name" className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input 
                    id="name"
                    className="input-modern bg-white/5 border-white/10 text-white focus:bg-white/10" 
                    placeholder="Jane Doe" 
                    value={formData.name} 
                    onChange={(e) => setFormData({...formData, name: e.target.value})} 
                    required 
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                  <input 
                    id="email"
                    className="input-modern bg-white/5 border-white/10 text-white focus:bg-white/10" 
                    type="email" 
                    placeholder="jane@example.com" 
                    value={formData.email} 
                    onChange={(e) => setFormData({...formData, email: e.target.value})} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="password" className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                  <div className="relative">
                    <input 
                      id="password"
                      className="input-modern bg-white/5 border-white/10 text-white focus:bg-white/10" 
                      type="password" 
                      placeholder="••••••••••••" 
                      value={formData.password} 
                      onChange={(e) => setFormData({...formData, password: e.target.value})} 
                      required 
                    />
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                  </div>
                  
                  {/* Strength Indicator */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Security Strength</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${strength >= 3 ? 'text-emerald-400' : strength >= 2 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {strength >= 4 ? 'Very Strong' : strength >= 3 ? 'Strong' : strength >= 2 ? 'Fair' : 'Weak'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className={`h-1 rounded-full transition-all duration-300 ${strength >= i ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-white/10'}`} />
                      ))}
                    </div>
                  </div>
                </div>

                {role === "worker" && (
                  <div className="space-y-1.5">
                    <label htmlFor="skill" className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Your Primary Skill</label>
                    <select 
                      id="skill"
                      className="input-modern bg-white/5 border-white/10 text-white focus:bg-white/10" 
                      value={formData.skill} 
                      onChange={(e) => setFormData({...formData, skill: e.target.value})}
                    >
                      <option className="bg-[#0A0F2C]">Plumbing</option>
                      <option className="bg-[#0A0F2C]">Electrical</option>
                      <option className="bg-[#0A0F2C]">Cleaning</option>
                      <option className="bg-[#0A0F2C]">Carpentry</option>
                      <option className="bg-[#0A0F2C]">Delivery</option>
                      <option className="bg-[#0A0F2C]">Tech Support</option>
                    </select>
                  </div>
                )}

                <Button type="submit" disabled={loading} className="btn-pill-primary w-full py-6 mt-4 group">
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</>
                  ) : (
                    <span className="flex items-center gap-2">
                      Create Secure Account
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  )}
                </Button>
              </form>
              <p className="text-xs text-slate-500 mt-6 text-center">
                By joining, you agree to our <a href="#" className="text-white hover:text-cyan-400 underline decoration-white/20">Terms</a> and <a href="#" className="text-white hover:text-cyan-400 underline decoration-white/20">Privacy Policy</a>.
              </p>
            </div>
          )}
        </div>

        {/* Security Badges */}
        <div className="mt-8 flex items-center justify-center gap-8 opacity-40">
          <div className="flex items-center gap-2 grayscale hover:grayscale-0 transition-all cursor-default group">
            <Lock className="h-4 w-4" />
            <span className="font-mono text-[10px] tracking-widest uppercase">AES-256 Escrow</span>
          </div>
          <div className="flex items-center gap-2 grayscale hover:grayscale-0 transition-all cursor-default group">
            <Bot className="h-4 w-4" />
            <span className="font-mono text-[10px] tracking-widest uppercase">AI Verified</span>
          </div>
        </div>
      </main>
    </div>
  );
}
