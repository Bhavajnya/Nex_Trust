import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuthContext } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { MagicHandshakeAPI } from "@/lib/api";

export const Route = createFileRoute("/my-jobs")({
  head: () => ({ meta: [{ title: "My Jobs — NexTrust" }] }),
  component: MyJobs,
});

function MyJobs() {
  const { user, profile } = useAuthContext();
  const role = profile?.role === 'worker' ? 'worker' : 'customer';
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const api = new MagicHandshakeAPI();

  useEffect(() => {
    if (!user?.uid) return;

    const loadJobs = async () => {
      try {
        setLoading(true);
        const jobsData = await api.listJobs({ role, limit: 20, offset: 0 });
        setJobs(jobsData || []);
      } catch (err) {
        console.error('[My Jobs] Failed to load jobs:', err);
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };

    loadJobs();
  }, [user?.uid, role]);

  return (
    <DashboardShell role={role} greeting={`My Jobs`}>
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Briefcase className="h-6 w-6 text-indigo-600" />
          <h2 className="text-2xl font-bold">Jobs</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Briefcase className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">No jobs yet</p>
            <p className="text-sm text-slate-500">Start by posting or accepting a job</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Title</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Budget</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-4 font-semibold text-slate-900">{job.title}</td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          {job.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">${job.budget}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
