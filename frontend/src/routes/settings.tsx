import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuthContext } from "@/context/AuthContext";
import { Settings as SettingsIcon, Shield, Mail, User, ShieldCheck, LogOut, Key } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — NexTrust" }] }),
  component: Settings,
});

function Settings() {
  const { user, profile, logout } = useAuthContext();
  const role = profile?.role === 'worker' ? 'worker' : 'customer';
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
      navigate({ to: "/" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell role={role} greeting={`Account Settings`}>
      <div className="space-y-6 max-w-4xl">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <User className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Profile Information</h2>
                  <p className="text-sm text-slate-500">Manage your public profile and identity.</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-700 font-medium">
                    <User className="h-4 w-4 text-slate-400" />
                    {profile?.name || "Not set"}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-700 font-medium overflow-hidden">
                    <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="truncate">{user?.email || "Not set"}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Account Role</label>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-700 font-medium capitalize">
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                    {profile?.role || "Not set"}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Trust Reputation</label>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-100 bg-indigo-50/50 text-indigo-700 font-bold">
                    <Shield className="h-4 w-4 text-indigo-500" />
                    {profile?.trustScore || 50}/100
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Key className="h-5 w-5 text-amber-600" />
                </div>
                <h3 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>Security</h3>
              </div>
              <p className="text-sm text-slate-500 mb-6">Security keys and password management are handled via Firebase.</p>
              <Button variant="outline" onClick={() => alert("Password reset link sent to your email!")} className="btn-pill-ghost border-slate-200 text-slate-600">
                <Key className="h-4 w-4" /> Reset Password
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-red-50/50 rounded-2xl border border-red-100 p-8 shadow-sm">
              <h3 className="font-bold text-red-700 mb-2" style={{ fontFamily: "var(--font-display)" }}>Danger Zone</h3>
              <p className="text-sm text-red-600/80 mb-6 font-medium">Once you sign out, you'll need to re-authenticate to access your escrow funds.</p>
              <Button
                onClick={handleLogout}
                disabled={loading}
                className="btn-pill-primary bg-red-600 hover:bg-red-700 shadow-red-200 w-full"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
