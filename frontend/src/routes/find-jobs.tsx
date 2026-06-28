import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuthContext } from "@/context/AuthContext";
import { Briefcase, MapPin, DollarSign, Calendar, Loader2, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { MagicHandshakeAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";

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
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.uid) return;

    const loadJobs = async () => {
      try {
        setLoading(true);
        // Workers should see jobs from ALL customers
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
    <DashboardShell role={role} greeting={`Available Opportunities`}>
      <div className="space-y-6">
        <div className="flex flex-col mb-8">
          <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Available Jobs</h2>
          <p className="text-sm text-slate-500">Find work that matches your skills and get paid instantly.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
            <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <Briefcase className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-slate-600 font-bold mb-1">No jobs available yet</p>
            <p className="text-sm text-slate-500">Check back later for new opportunities in your area.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {jobs.map((job) => (
              <div key={job.id} className="bg-white rounded-3xl border border-slate-200 p-8 hover:border-indigo-500 hover:shadow-xl transition-all duration-300 group cursor-pointer" onClick={() => navigate({ to: `/job/${job.id}` })}>
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors" style={{ fontFamily: "var(--font-display)" }}>{job.title}</h3>
                    <p className="text-sm text-slate-500 mt-2 line-clamp-2 leading-relaxed">{job.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-3xl font-bold text-indigo-600" style={{ fontFamily: "var(--font-display)" }}>${job.budget}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Budget</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                  {job.location && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-100">
                      <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                      {job.location}
                    </div>
                  )}
                  {job.deadline && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-100">
                      <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                      {new Date(job.deadline).toLocaleDateString()}
                    </div>
                  )}
                  <div className="ml-auto flex items-center gap-2 text-indigo-600 group-hover:gap-3 transition-all">
                    <span>View Job Details</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6 mt-12">
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <h3 className="font-bold text-lg mb-6" style={{ fontFamily: "var(--font-display)" }}>Popular Skills in Demand</h3>
            <div className="flex flex-wrap gap-2">
              {["Web Development", "Mobile Apps", "UI/UX Design", "Data Analysis", "Content Writing", "Plumbing", "Electrical"].map(skill => (
                <div key={skill} className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-semibold border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-colors cursor-default">{skill}</div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <h3 className="font-bold text-lg mb-6" style={{ fontFamily: "var(--font-display)" }}>Your Worker Stats</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Jobs Completed</div>
                <div className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>0</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Earned</div>
                <div className="text-xl font-bold text-emerald-600" style={{ fontFamily: "var(--font-display)" }}>$0</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Trust Rating</div>
                <div className="text-xl font-bold text-indigo-600" style={{ fontFamily: "var(--font-display)" }}>{profile?.trustScore || 50}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
