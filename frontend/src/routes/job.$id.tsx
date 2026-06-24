import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Calendar, DollarSign, User, CheckCircle2, AlertCircle, Loader2, Clock } from "lucide-react";
import { useAuthContext } from "@/context/AuthContext";
import { MagicHandshakeAPI } from "@/lib/api";

export const Route = createFileRoute("/job/$id")({
  head: () => ({ meta: [{ title: "Job Details — Magic Handshake" }] }),
  component: JobDetailsPage,
});

function JobDetailsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuthContext();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [starting, setStarting] = useState(false);
  const api = new MagicHandshakeAPI();

  useEffect(() => {
    const loadJobDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        const jobData = await api.getJob(id);
        if (jobData) {
          setJob(jobData);
        } else {
          setError("Job not found");
        }
      } catch (err) {
        console.error("[v0] Failed to load job:", err);
        setError("Failed to load job details");
      } finally {
        setLoading(false);
      }
    };

    loadJobDetails();
  }, [id]);

  const handleAcceptJob = async () => {
    if (!job) return;
    try {
      setAccepting(true);
      await api.acceptJob(job.id);
      // Refresh job details
      const updated = await api.getJob(job.id);
      setJob(updated);
    } catch (err) {
      console.error("[v0] Failed to accept job:", err);
      setError("Failed to accept job. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  const handleStartJob = async () => {
    if (!job) return;
    try {
      setStarting(true);
      await api.startJob(job.id);
      // Refresh job details
      const updated = await api.getJob(job.id);
      setJob(updated);
    } catch (err) {
      console.error("[v0] Failed to start job:", err);
      setError("Failed to start job. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "CREATED":
      case "FUNDED":
        return "bg-blue-100 text-blue-800";
      case "IN_PROGRESS":
        return "bg-yellow-100 text-yellow-800";
      case "EVIDENCE_SUBMITTED":
        return "bg-orange-100 text-orange-800";
      case "VERIFIED":
      case "RELEASED":
        return "bg-green-100 text-green-800";
      case "DISPUTED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-slate-600">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <button
          onClick={() => navigate({ to: "/dashboard/customer" })}
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 border border-red-200">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-1" />
            <div>
              <h2 className="text-lg font-bold text-red-900">Error Loading Job</h2>
              <p className="text-red-700 mt-2">{error || "Job not found"}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isOwner = job.buyerId === user?.uid;
  const isWorker = job.workerId === user?.uid;
  const canAccept = job.status === "FUNDED" && !isOwner && !job.workerId;
  const canStart = job.status === "FUNDED" && isWorker;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate({ to: "/dashboard/customer" })}
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Job Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="p-8">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-slate-900 mb-2">{job.title}</h1>
                <p className="text-slate-600">{job.description}</p>
              </div>
              <div className={`px-4 py-2 rounded-lg font-semibold text-sm ${getStatusColor(job.status)}`}>
                {job.status}
              </div>
            </div>

            {/* Job Meta Information */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-xs text-slate-500 uppercase">Budget</div>
                  <div className="font-bold text-lg">${job.budget}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-xs text-slate-500 uppercase">Posted</div>
                  <div className="font-semibold text-sm">{formatDate(job.createdAt)}</div>
                </div>
              </div>
              {job.deadline && (
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-xs text-slate-500 uppercase">Deadline</div>
                    <div className="font-semibold text-sm">{formatDate(job.deadline)}</div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-xs text-slate-500 uppercase">Evidence</div>
                  <div className="font-semibold text-sm">{job.evidenceCount || 0} uploaded</div>
                </div>
              </div>
            </div>

            {/* Requirements */}
            {job.requirements && job.requirements.length > 0 && (
              <div className="mb-6">
                <h3 className="font-bold text-slate-900 mb-3">Requirements</h3>
                <ul className="space-y-2">
                  {job.requirements.map((req: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Worker Information */}
        {job.workerId && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              Assigned Worker
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{job.freelancerName || "Worker"}</p>
                <p className="text-sm text-slate-600">Status: {job.status}</p>
              </div>
              {isWorker && canStart && (
                <button
                  onClick={handleStartJob}
                  disabled={starting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {starting ? "Starting..." : "Start Work"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {canAccept && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Ready to work on this job?</h3>
                <p className="text-sm text-slate-600 mt-1">Accept this job to start working</p>
              </div>
              <button
                onClick={handleAcceptJob}
                disabled={accepting}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {accepting ? "Accepting..." : "Accept Job"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
