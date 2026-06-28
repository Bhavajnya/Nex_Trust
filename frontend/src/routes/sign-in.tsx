import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck, Building, Lock } from "lucide-react";
import { HeroOrbs } from "@/components/ui-bits";
import { useState } from "react";
import { useAuthContext } from "../context/AuthContext";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/sign-in")({
  head: () => ({ meta: [{ title: "Sign in — NexTrust" }] }),
  component: SignIn,
});

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuthContext();
  const navigate = useNavigate();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      console.log('[Sign In] Attempting login for:', email);
      const result = await login(email, password);

      if (!result.success) {
        const errorMsg = result.error || "Sign in failed";
        console.error('[Sign In] Login failed:', errorMsg);
        setError(errorMsg);
        setLoading(false);
        return;
      }

      console.log('[Sign In] Login successful, profile:', result.profile);

      // Login succeeded, wait for state to settle and profile to load
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get the user's role from the profile
      const { profile } = result;
      const dashboard = profile?.role === 'worker' ? '/dashboard/worker' : '/dashboard/customer';

      console.log('[Sign In] Navigating to dashboard:', dashboard, 'Role:', profile?.role);
      navigate({ to: dashboard });
    } catch (err: any) {
      console.error("[Sign In] Sign in exception:", err);
      const errorMsg = err.code ? `Firebase Error (${err.code}): ${err.message}` : (err.message || "Sign in failed");
      setError(errorMsg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left Panel: Brand & Visuals */}
      <div className="relative overflow-hidden hidden lg:flex flex-col justify-center px-16 xl:px-24" style={{ background: "linear-gradient(135deg, var(--navy), var(--navy-2))" }}>
        <HeroOrbs />
        
        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-white mb-12" style={{ fontFamily: "var(--font-display)" }}>
            <ShieldCheck className="h-6 w-6" style={{ color: "var(--cyan-glow)" }} /> Magic Handshake
          </Link>
          
          <h1 className="text-5xl font-extrabold text-white leading-[1.15] mb-6" style={{ fontFamily: "var(--font-display)" }}>
            Welcome back.<br />Your escrow's right where you left it.
          </h1>
          <p className="text-lg text-slate-300 max-w-md mb-12">Resume jobs in progress, review AI verifications, and release payments — all in one secure place.</p>
          
          {/* Glass Card Preview */}
          <div className="glass-card p-6 max-w-sm animate-fade-up">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest" style={{ fontFamily: "var(--font-mono)" }}>Active Job #8421</div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Awaiting Verification
              </span>
            </div>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                <Building className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">High-Rise Electrical Fix</div>
                <div className="text-xs text-white/60">Worker: @electra_pro</div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <span className="text-[10px] font-medium text-white/40 flex items-center gap-1.5" style={{ fontFamily: "var(--font-mono)" }}>
                <Lock className="h-3 w-3 text-cyan-400" /> 0x8f2a…c821
              </span>
              <span className="text-sm font-bold text-white">$1,250.00</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: Form Area */}
      <div className="flex items-center justify-center p-8 sm:p-12 lg:p-24 bg-white">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden flex items-center gap-2 font-bold text-xl mb-12" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>
            <ShieldCheck className="h-6 w-6" style={{ color: "var(--indigo)" }} /> Magic Handshake
          </Link>

          <div className="mb-10 animate-fade-up">
            <h2 className="text-3xl font-extrabold mb-2" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Sign in</h2>
            <p className="text-slate-500">Secure access to your Magic Handshake portal.</p>
          </div>

          {error && <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 animate-fade-up">{error}</div>}

          <form onSubmit={handleSignIn} className="space-y-4 animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-semibold text-slate-700 ml-1">Email address</label>
              <input 
                id="email"
                type="email" 
                placeholder="you@email.com" 
                className="input-modern" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</label>
                <a href="#" className="text-xs font-bold text-indigo-600 hover:text-indigo-700">Forgot password?</a>
              </div>
              <input 
                id="password"
                type="password" 
                placeholder="••••••••" 
                className="input-modern" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" id="remember" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <label htmlFor="remember" className="text-sm text-slate-600 cursor-pointer">Keep me signed in</label>
            </div>

            <Button type="submit" disabled={loading} className="btn-pill-primary w-full py-6 mt-4">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</> : "Sign in to NexTrust"}
            </Button>

            <div className="relative py-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold text-slate-400"><span className="bg-white px-4">Or continue with</span></div>
            </div>

            <button type="button" className="w-full inline-flex items-center justify-center gap-3 px-6 py-3 border-2 border-slate-100 rounded-2xl font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-200 transition">
              <GoogleIcon />
              Google Account
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-slate-500 animate-fade-up" style={{ animationDelay: '0.2s' }}>
            New to NexTrust? <Link to="/sign-up" className="font-bold text-indigo-600 hover:underline">Create a secure account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>;
}
