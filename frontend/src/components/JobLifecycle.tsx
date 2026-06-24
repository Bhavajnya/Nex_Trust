import React from 'react';

// Job states from backend
export enum JobState {
  CREATED = 'CREATED',
  FUNDED = 'FUNDED',
  ACCEPTED = 'ACCEPTED',
  IN_PROGRESS = 'IN_PROGRESS',
  EVIDENCE_SUBMITTED = 'EVIDENCE_SUBMITTED',
  AI_VERIFIED = 'AI_VERIFIED',
  RELEASED = 'RELEASED',
  DISPUTED = 'DISPUTED',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

interface JobLifecycleProps {
  currentState: JobState;
  isWorker?: boolean;
  isCustomer?: boolean;
}

// State metadata for display
const stateConfig = {
  [JobState.CREATED]: {
    label: 'Created',
    description: 'Job posted and awaiting funding',
    color: 'bg-blue-100 text-blue-800',
    icon: '📝',
    nextStates: [JobState.FUNDED, JobState.CANCELLED],
  },
  [JobState.FUNDED]: {
    label: 'Funded',
    description: 'Escrow locked, awaiting worker acceptance',
    color: 'bg-yellow-100 text-yellow-800',
    icon: '💰',
    nextStates: [JobState.ACCEPTED, JobState.CANCELLED],
  },
  [JobState.ACCEPTED]: {
    label: 'Accepted',
    description: 'Worker has accepted, ready to start',
    color: 'bg-purple-100 text-purple-800',
    icon: '🤝',
    nextStates: [JobState.IN_PROGRESS, JobState.CANCELLED],
  },
  [JobState.IN_PROGRESS]: {
    label: 'In Progress',
    description: 'Work is being performed',
    color: 'bg-orange-100 text-orange-800',
    icon: '⚙️',
    nextStates: [JobState.EVIDENCE_SUBMITTED, JobState.DISPUTED],
  },
  [JobState.EVIDENCE_SUBMITTED]: {
    label: 'Evidence Submitted',
    description: 'Worker submitted photos/evidence for verification',
    color: 'bg-indigo-100 text-indigo-800',
    icon: '📸',
    nextStates: [JobState.AI_VERIFIED, JobState.DISPUTED],
  },
  [JobState.AI_VERIFIED]: {
    label: 'AI Verified',
    description: 'Evidence passed AI verification check',
    color: 'bg-green-100 text-green-800',
    icon: '✅',
    nextStates: [JobState.RELEASED, JobState.DISPUTED],
  },
  [JobState.RELEASED]: {
    label: 'Released',
    description: 'Payment released to worker',
    color: 'bg-emerald-100 text-emerald-800',
    icon: '💸',
    nextStates: [],
  },
  [JobState.DISPUTED]: {
    label: 'Disputed',
    description: 'Under manual review',
    color: 'bg-red-100 text-red-800',
    icon: '⚠️',
    nextStates: [JobState.RESOLVED],
  },
  [JobState.RESOLVED]: {
    label: 'Resolved',
    description: 'Dispute resolved',
    color: 'bg-green-100 text-green-800',
    icon: '✅',
    nextStates: [JobState.RELEASED, JobState.CANCELLED],
  },
  [JobState.CANCELLED]: {
    label: 'Cancelled',
    description: 'Job has been cancelled',
    color: 'bg-gray-100 text-gray-800',
    icon: '❌',
    nextStates: [],
  },
  [JobState.FAILED]: {
    label: 'Failed',
    description: 'Job failed or is on hold',
    color: 'bg-red-100 text-red-800',
    icon: '❌',
    nextStates: [],
  },
};

/**
 * State indicator badge
 */
export function JobStateBadge({ state }: { state: JobState }) {
  const config = stateConfig[state];
  if (!config) return null;

  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

/**
 * Job lifecycle progress indicator
 */
export function JobLifecycleIndicator({ currentState, isWorker, isCustomer }: JobLifecycleProps) {
  const normalFlow = [
    JobState.CREATED,
    JobState.FUNDED,
    JobState.ACCEPTED,
    JobState.IN_PROGRESS,
    JobState.EVIDENCE_SUBMITTED,
    JobState.AI_VERIFIED,
    JobState.RELEASED,
  ];

  const currentIndex = normalFlow.indexOf(currentState);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {normalFlow.map((state, index) => {
          const config = stateConfig[state];
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isNext = index === currentIndex + 1;

          return (
            <div key={state} className="flex flex-col items-center flex-1">
              {/* Circle indicator */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-semibold transition-all ${
                  isComplete
                    ? 'bg-green-500 text-white'
                    : isCurrent
                      ? 'bg-blue-500 text-white ring-4 ring-blue-200'
                      : isNext
                        ? 'bg-yellow-400 text-white'
                        : 'bg-gray-200 text-gray-600'
                }`}
              >
                {config.icon}
              </div>

              {/* Label */}
              <p className="text-xs font-medium mt-2 text-center">{config.label}</p>

              {/* Connector line */}
              {index < normalFlow.length - 1 && (
                <div
                  className={`absolute top-5 left-1/2 w-full h-0.5 -z-10 ${isComplete ? 'bg-green-500' : 'bg-gray-300'}`}
                  style={{
                    marginLeft: `${(index + 1) * (100 / normalFlow.length) - 50}%`,
                    width: `${100 / normalFlow.length}%`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* State description */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm font-medium text-gray-900">{stateConfig[currentState]?.label}</p>
        <p className="text-sm text-gray-600 mt-1">{stateConfig[currentState]?.description}</p>

        {/* Show next possible actions */}
        {stateConfig[currentState]?.nextStates && stateConfig[currentState]?.nextStates.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-700 mb-2">Next possible states:</p>
            <div className="flex gap-2">
              {stateConfig[currentState]?.nextStates.map((nextState) => (
                <span key={nextState} className="text-xs px-2 py-1 bg-white border border-gray-300 rounded">
                  {stateConfig[nextState]?.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Role-specific actions */}
      {(isWorker || isCustomer) && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm font-medium text-blue-900 mb-2">Your role:</p>
          <p className="text-sm text-blue-800">
            {isWorker
              ? 'You are the worker. Upload evidence when work is complete.'
              : 'You are the customer. You will receive evidence from the worker for verification.'}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Dispute path indicator (alternative to normal flow)
 */
export function DisputeIndicator() {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start gap-3">
        <span className="text-2xl">⚠️</span>
        <div>
          <p className="font-medium text-red-900">Dispute Status</p>
          <p className="text-sm text-red-800 mt-1">This job is under manual review. Both parties will be notified of the resolution.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Timeline of state transitions
 */
export function JobTimeline({ transitions }: { transitions: Array<{ state: JobState; timestamp: string; by?: string }> }) {
  return (
    <div className="space-y-4">
      <h3 className="font-medium text-gray-900">Job Timeline</h3>
      <div className="border-l-2 border-gray-300 space-y-0">
        {transitions.map((transition, index) => {
          const config = stateConfig[transition.state];
          return (
            <div key={index} className="pb-6 pl-4 relative">
              {/* Timeline dot */}
              <div className="absolute -left-3 top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-white" />

              {/* Content */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{config?.label}</p>
                  <p className="text-sm text-gray-600">{config?.description}</p>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <p>{transition.timestamp}</p>
                  {transition.by && <p className="text-xs text-gray-500">by {transition.by}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default JobLifecycleIndicator;
