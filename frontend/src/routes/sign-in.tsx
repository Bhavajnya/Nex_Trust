import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shield, Loader2 } from "lucide-react";
import { HeroOrbs } from "@/components/ui-bits";
import { useState } from "react";
import { useAuthContext } from "../context/AuthContext";

export const Route = createFileRoute("/sign-in")({
  head: () => ({ meta: [{ title: "Sign in — Magic Handshake" }] }),
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
      console.error('[Sign In] Full error:', err);
      setError(errorMsg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative overflow-hidden text-white hidden lg:flex items-center" style={{ background: "var(--navy)" }}>
        <HeroOrbs />
        <div className="relative px-12 max-w-md">
          <Link to="/" className="inline-flex items-center gap-2 font-bold text-lg" style={{ fontFamily: "var(--font-display)" }}>
            <Shield className="h-5 w-5" style={{ color: "var(--cyan-glow)" }} /> Magic Handshake
          </Link>
          <h1 className="mt-10 text-4xl font-bold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Welcome back. Your escrow's right where you left it.
          </h1>
          <p className="mt-4 text-slate-300">Resume jobs in progress, review AI verifications, and release payments — all in one place.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <Link to="/" className="lg:hidden inline-flex items-center gap-2 font-bold text-lg mb-8" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>
            <Shield className="h-5 w-5" style={{ color: "var(--indigo)" }} /> Magic Handshake
          </Link>
          <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Sign in</h2>
          <p className="text-sm text-slate-500 mt-1">Use your email to sign in.</p>

          {error && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          <form onSubmit={handleSignIn} className="mt-6 space-y-3">
            <input 
              type="email" 
              placeholder="you@email.com" 
              className="input" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input 
              type="password" 
              placeholder="Password" 
              className="input" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loading} className="btn-pill-primary w-full justify-center mt-2 disabled:opacity-50">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</> : "Sign in"}
            </button>
          </form>
          <p className="mt-6 text-sm text-slate-500">No account? <Link to="/sign-up" className="font-semibold" style={{ color: "var(--indigo)" }}>Sign up free</Link></p>
        </div>
      </div>
      <style>{`.input{width:100%;padding:0.7rem 1rem;border:1px solid #E2E8F0;border-radius:0.875rem;background:white;color:var(--navy);outline:none;transition:all .2s}.input:focus{border-color:var(--indigo);box-shadow:0 0 0 3px color-mix(in oklab, var(--indigo) 20%, transparent)}`}</style>
    </div>
  );
}

function GoogleIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>;
}
