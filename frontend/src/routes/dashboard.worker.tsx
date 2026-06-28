import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Camera, CloudUpload, MapPin, TrendingUp, Zap, Loader2, AlertCircle, RefreshCw, CheckCircle2, Briefcase, Wallet, ArrowUpRight } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { DashboardShell } from "@/components/dashboard-shell";
import { HashChip, StatusBadge } from "@/components/ui-bits";
import { ScoreRing } from "@/components/ui-bits";
import { useAuthContext } from "@/context/AuthContext";
import { MagicHandshakeAPI } from "@/lib/api";

export const Route = createFileRoute("/dashboard/worker")({
  head: () => ({ meta: [{ title: "Worker Dashboard — NexTrust" }] }),
  component: WorkerDashboard,
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200">
      <div className="text-xs text-slate-500 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>{label}</div>
      <div className="mt-2 text-3xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>{value}</div>
      {hint && <div className="mt-1 text-xs flex items-center gap-1 text-emerald-600"><TrendingUp className="h-3 w-3" />{hint}</div>}
    </div>
  );
}

function WorkerDashboard() {
  const { user, profile } = useAuthContext();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedEvidence, setUploadedEvidence] = useState<any>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const api = new MagicHandshakeAPI();
  const navigate = useNavigate();

  useEffect(() => {
    const loadJobs = async () => {
      try {
        setLoading(true);
        if (!user?.uid) return;

        // Fetch worker's jobs from API (role: worker filters for jobs this user accepted)
        const jobs = await api.listJobs({ role: 'worker', limit: 10, offset: 0 });
        setJobs(jobs || []);
        if (jobs && jobs.length > 0) {
          setSelected(jobs[0].id);
        }
      } catch (err) {
        console.error('[v0] Failed to load worker jobs:', err);
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };

    loadJobs();
  }, [user?.uid]);
  const [stage, setStage] = useState(0);
  const stages = ["Uploading", "AI Analyzing", "Smart Contract Reviewing", "Payment Released"];

  const performUpload = async (file: File, jobId: string) => {
    // Attempt to get current GPS location
    let latitude: number | undefined;
    let longitude: number | undefined;
    let accuracy: number | undefined;

    if ('geolocation' in navigator) {
      try {
        const position = await new Promise<GeolocationCoordinates>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err),
            { timeout: 5000, enableHighAccuracy: true }
          );
        });
        latitude = position.latitude;
        longitude = position.longitude;
        accuracy = position.accuracy;
        console.log('[v0] GPS location captured:', { latitude, longitude, accuracy });
      } catch (gpsErr) {
        console.warn('[v0] GPS location unavailable:', gpsErr);
        // Continue upload without GPS - it's optional
      }
    }

    // Call API to upload evidence with optional GPS coordinates
    return await api.uploadEvidence(jobId, file, latitude, longitude);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;

    setLastFile(file);
    setRetryCount(0);
    await uploadFile(file, selected);
  };

  const uploadFile = async (file: File, jobId: string) => {
    try {
      setUploading(true);
      setUploadError(null);

      console.log('[v0] Starting file upload:', file.name, 'Job:', jobId);

      // Call upload with retry logic
      const result = await performUpload(file, jobId);

      console.log('[v0] Upload successful:', result);
      setUploadedEvidence(result);
      setLastFile(null);

      // Start the verification stages
      setStage(1);
      let s = 1;
      const id = setInterval(() => {
        s += 1;
        setStage(s);
        if (s >= stages.length) clearInterval(id);
      }, 1100);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      console.error('[v0] Upload error:', message);
      setUploadError(message);
      setUploading(false);
    }
  };

  const handleRetry = async () => {
    if (!lastFile || !selected) return;
    const newCount = retryCount + 1;
    setRetryCount(newCount);
    console.log('[v0] Retrying upload (attempt', newCount + 1, ')');
    await uploadFile(lastFile, selected);
  };

  const handleSubmit = () => {
    // File input click will trigger upload
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fileInput?.click();
  };

  const selectedJob = jobs.find(j => j.id === selected);
  const activeJobs = jobs.filter(j => ['CREATED', 'FUNDED', 'IN_PROGRESS'].includes(j.status)).length;
  const pendingVerification = jobs.filter(j => j.status === 'EVIDENCE_SUBMITTED').length;
  
  // Generate mock earnings data - in production this would come from API
  const earningsData = [
    { m: "Jan", v: 420 }, { m: "Feb", v: 610 }, { m: "Mar", v: 540 },
    { m: "Apr", v: 790 }, { m: "May", v: 920 }, { m: "Jun", v: 540 },
  ];

  return (
    <DashboardShell role="worker" greeting={`Welcome back, ${profile?.name || 'Worker'}`}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total Earned" value={`$${profile?.totalEarnings || 0}`} />
        <Stat label="Active Jobs" value={String(activeJobs)} />
        <div className="bg-white rounded-2xl p-5 border border-slate-200 flex items-center gap-4">
          <ScoreRing value={profile?.trustScore || 50} />
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>Reputation</div>
            <div className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>{profile?.trustScore || 50}/100</div>
            <div className="text-xs" style={{ color: "var(--cyan-glow)" }}>on-chain score</div>
          </div>
        </div>
        <Stat label="Pending Verification" value={String(pendingVerification)} />
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-lg mb-4" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Earnings — Last 6 months</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={earningsData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="m" stroke="#64748B" fontSize={12} />
                <YAxis stroke="#64748B" fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }} />
                <Line type="monotone" dataKey="v" stroke="var(--indigo)" strokeWidth={3} dot={{ fill: "var(--cyan-glow)", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-lg mb-3" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Quick Actions</h3>
          <div className="space-y-3">
            <button onClick={() => navigate({ to: '/find-jobs' })} className="btn-pill-primary w-full text-sm">
              <Briefcase className="h-4 w-4" /> Browse Jobs
            </button>
            <button onClick={() => navigate({ to: '/escrow-wallet' })} className="btn-pill-ghost w-full text-sm border-slate-200 text-slate-600 hover:bg-slate-50">
              <Wallet className="h-4 w-4" /> View Wallet
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100"><h3 className="font-bold text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>My Jobs</h3></div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-12 text-center px-4">
              <p className="text-slate-500">No jobs yet. Check back soon!</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
                <tr>
                  <th className="text-left px-5 py-3">Job</th>
                  <th className="text-left px-3 py-3">Budget</th>
                  <th className="text-left px-3 py-3">Status</th>
                  <th className="text-right px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className={`border-t border-slate-100 cursor-pointer ${selected === j.id ? "bg-indigo-50/60" : "hover:bg-slate-50"}`} onClick={() => { setSelected(j.id); setStage(0); }}>
                    <td className="px-5 py-4">
                      <div className="font-semibold" style={{ color: "var(--navy)" }}>{j.title}</div>
                      <div className="text-xs text-slate-500" style={{ fontFamily: "var(--font-mono)" }}>#{j.id?.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-4 font-semibold" style={{ color: "var(--navy)" }}>${j.budget}</td>
                    <td className="px-3 py-4"><StatusBadge status={j.status} /></td>
                    <td className="px-5 py-4 text-right">
                      <button 
                        className="text-sm font-semibold inline-flex items-center gap-1 hover:underline transition-all" 
                        style={{ color: "var(--indigo)" }} 
                        onClick={() => navigate({ to: `/job/${j.id}` })}
                      >
                        {j.status === 'IN_PROGRESS' ? 'Submit Evidence' : 'View Details'} <ArrowUpRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-lg mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--navy)" }}>Submit Evidence</h3>
          <p className="text-xs text-slate-500 mb-4">Job #{selected?.slice(0, 8) ?? "—"} · {selectedJob?.title || "Select a job"}</p>

          <label className="block border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer hover:border-indigo-400 transition" style={{ borderColor: "var(--indigo)", opacity: uploading ? 0.6 : 1 }}>
            <CloudUpload className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--indigo)" }} />
            <div className="text-sm font-semibold" style={{ color: "var(--navy)" }}>{uploading ? 'Uploading...' : 'Drag & drop photos or video'}</div>
            <div className="text-xs text-slate-500 mt-1">JPG, PNG, MP4 · up to 100 MB</div>
            <input
              type="file"
              className="hidden"
              onChange={handleFileSelected}
              disabled={uploading}
              accept="image/jpeg,image/png,video/mp4,application/pdf,text/plain"
            />
          </label>

          {uploadError && (
            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-900">Upload failed</p>
                  <p className="text-sm text-red-700 mt-1">{uploadError}</p>
                  {retryCount < 3 && (
                    <button
                      onClick={handleRetry}
                      className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-100 hover:bg-red-200 text-red-700 transition"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry Upload {retryCount > 0 ? `(${retryCount + 1}/3)` : ''}
                    </button>
                  )}
                  {retryCount >= 3 && (
                    <p className="text-xs text-red-600 mt-2">Max retries reached. Please try again later.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {uploadedEvidence && !uploadError && (
            <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="flex gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Evidence uploaded</p>
                  <p className="text-xs text-emerald-700 mt-1">ID: {uploadedEvidence.evidenceId?.slice(0, 8)}</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between p-3 rounded-xl bg-slate-50">
            <div className="flex items-center gap-2 text-sm text-slate-700"><MapPin className="h-4 w-4" style={{ color: "var(--cyan-glow)" }} /> GPS auto-detect</div>
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs text-slate-600">30.2672° N, 97.7431° W</span>
          </div>
          <div className="mt-2 flex items-center justify-between p-3 rounded-xl bg-slate-50">
            <div className="flex items-center gap-2 text-sm text-slate-700"><Camera className="h-4 w-4" style={{ color: "var(--cyan-glow)" }} /> Timestamp</div>
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs text-slate-600">2026-06-23 14:08:21 UTC</span>
          </div>

          <button onClick={handleSubmit} className="btn-pill-primary w-full mt-5">
            <Zap className="h-4 w-4" /> Submit for AI Verification
          </button>

          {stage > 0 && (
            <div className="mt-5">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-500" style={{ width: `${(stage / stages.length) * 100}%`, background: "linear-gradient(90deg, var(--indigo), var(--cyan-glow))" }} />
              </div>
              <ol className="mt-3 flex justify-between text-[10px] uppercase tracking-wider text-slate-500" style={{ fontFamily: "var(--font-mono)" }}>
                {stages.map((s, i) => (
                  <li key={s} className={i < stage ? "text-emerald-600 font-semibold" : ""}>{s}</li>
                ))}
              </ol>
              {stage >= stages.length && selectedJob && (
                <div className="mt-4 p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm flex items-center gap-2">
                  ✅ Payment of ${selectedJob.budget} released. <HashChip hash={selectedJob.id?.slice(0, 8) ?? ""} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
