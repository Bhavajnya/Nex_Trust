import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuthContext } from "@/context/AuthContext";
import { Settings as SettingsIcon } from "lucide-react";
import { useState } from "react";

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
    <DashboardShell role={role} greeting={`Settings`}>
      <div className="space-y-6 max-w-2xl">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <SettingsIcon className="h-5 w-5" />
            <h2 className="text-lg font-bold">Account Settings</h2>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Email</label>
              <input type="email" value={user?.email || ""} disabled className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Name</label>
              <input type="text" value={profile?.name || ""} disabled className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Account Type</label>
              <div className="px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 capitalize">{profile?.role || "Not set"}</div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Trust Score</label>
              <div className="px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500">{profile?.trustScore || 50}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-bold mb-4">Security</h3>
          <button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50">Change Password</button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-bold mb-4 text-red-600">Danger Zone</h3>
          <button
            onClick={handleLogout}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50"
          >
            {loading ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}
