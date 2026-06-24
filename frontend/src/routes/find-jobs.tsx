import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuthContext } from "@/context/AuthContext";
import { Briefcase, MapPin, DollarSign, Calendar, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MagicHandshakeAPI } from "@/lib/api";

export const Route = createFileRoute("/find-jobs")({
  head: () => ({ meta: [{ title: "Find Jobs — NexTrust" }] }),
  component: FindJobs,
});

function FindJobs() {
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
        const jobsData = await api.listJobs({ role: 'customer', limit: 20, offset: 0 });
        setJobs(jobsData || []);
      } catch (err) {
        console.error('[Find Jobs] Failed to load jobs:', err);
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };

    loadJobs();
  }, [user?.uid]);

  return (
    <DashboardShell role={role} greeting={`Find Jobs`}>
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Briefcase className="h-6 w-6 text-indigo-600" />
          <h2 className="text-2xl font-bold">Available Jobs</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Briefcase className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">No jobs available yet</p>
            <p className="text-sm text-slate-500">Check back later for new opportunities</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {jobs.map((job) => (
              <div key={job.id} className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{job.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">{job.description?.substring(0, 100)}...</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-indigo-600">${job.budget}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                  {job.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {job.location}
                    </div>
                  )}
                  {job.deadline && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {new Date(job.deadline).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <button className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700">
                  View Job
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="font-bold mb-4">Popular Skills in Demand</h3>
            <div className="space-y-3">
              {["Web Development", "Mobile Apps", "UI/UX Design", "Data Analysis", "Content Writing"].map(skill => (
                <div key={skill} className="px-4 py-2 rounded-lg bg-slate-50 text-sm">{skill}</div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="font-bold mb-4">Your Stats</h3>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-500">Jobs Completed</div>
                <div className="text-2xl font-bold">0</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Total Earned</div>
                <div className="text-2xl font-bold">$0</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Success Rate</div>
                <div className="text-2xl font-bold">N/A</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
