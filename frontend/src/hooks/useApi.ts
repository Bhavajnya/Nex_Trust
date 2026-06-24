import { useCallback, useState } from 'react';
import useSWR, { SWRConfiguration } from 'swr';
import { apiClient, Job, User, Evidence, Dispute } from '../lib/api';

/**
 * Hook for fetching jobs
 */
export function useJobs(params?: { status?: string; role?: 'customer' | 'worker' }, options?: SWRConfiguration) {
  const { data, error, isLoading, mutate } = useSWR(
    ['jobs', params],
    async () => {
      return await apiClient.listJobs(params);
    },
    { revalidateOnFocus: false, dedupingInterval: 60000, ...options }
  );

  return {
    jobs: data,
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook for fetching a single job
 */
export function useJob(jobId: string | null, options?: SWRConfiguration) {
  const { data, error, isLoading, mutate } = useSWR(
    jobId ? ['job', jobId] : null,
    async () => {
      if (!jobId) return null;
      return await apiClient.getJob(jobId);
    },
    { revalidateOnFocus: false, ...options }
  );

  return {
    job: data,
    isLoading: isLoading && jobId !== null,
    error,
    mutate,
  };
}

/**
 * Hook for fetching current user
 */
export function useCurrentUser(options?: SWRConfiguration) {
  const { data, error, isLoading, mutate } = useSWR(
    'currentUser',
    async () => {
      return await apiClient.getCurrentUser();
    },
    { revalidateOnFocus: false, dedupingInterval: 60000, ...options }
  );

  return {
    user: data,
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook for fetching evidence for a job
 */
export function useEvidence(jobId: string | null, options?: SWRConfiguration) {
  const { data, error, isLoading, mutate } = useSWR(
    jobId ? ['evidence', jobId] : null,
    async () => {
      if (!jobId) return null;
      return await apiClient.getEvidence(jobId);
    },
    { revalidateOnFocus: false, ...options }
  );

  return {
    evidence: data,
    isLoading: isLoading && jobId !== null,
    error,
    mutate,
  };
}

/**
 * Hook for fetching trust score
 */
export function useTrustScore(userId: string | null, options?: SWRConfiguration) {
  const { data, error, isLoading } = useSWR(
    userId ? ['trustScore', userId] : null,
    async () => {
      if (!userId) return null;
      return await apiClient.getTrustScore(userId);
    },
    { revalidateOnFocus: false, dedupingInterval: 300000, ...options }
  );

  return {
    score: data,
    isLoading: isLoading && userId !== null,
    error,
  };
}

/**
 * Hook for creating a job
 */
export function useCreateJob() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createJob = useCallback(
    async (title: string, description: string, budget: number, deadline?: string, requirements?: string[]) => {
      try {
        setIsLoading(true);
        setError(null);
        const job = await apiClient.createJob({
          title,
          description,
          budget,
          deadline,
          requirements,
        });
        return job;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create job');
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { createJob, isLoading, error };
}

/**
 * Hook for accepting a job
 */
export function useAcceptJob() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const acceptJob = useCallback(async (jobId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const job = await apiClient.acceptJob(jobId);
      return job;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to accept job');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { acceptJob, isLoading, error };
}

/**
 * Hook for starting a job
 */
export function useStartJob() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startJob = useCallback(async (jobId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const job = await apiClient.startJob(jobId);
      return job;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start job');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { startJob, isLoading, error };
}

/**
 * Hook for canceling a job
 */
export function useCancelJob() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cancelJob = useCallback(async (jobId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const job = await apiClient.cancelJob(jobId);
      return job;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to cancel job');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { cancelJob, isLoading, error };
}

/**
 * Hook for uploading evidence
 */
export function useUploadEvidence() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const uploadEvidence = useCallback(
    async (jobId: string, file: File, latitude?: number, longitude?: number) => {
      try {
        setIsLoading(true);
        setError(null);
        const evidence = await apiClient.uploadEvidence(jobId, file, latitude, longitude);
        return evidence;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to upload evidence');
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { uploadEvidence, isLoading, error };
}

/**
 * Hook for creating a dispute
 */
export function useCreateDispute() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createDispute = useCallback(async (jobId: string, reason: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const dispute = await apiClient.createDispute(jobId, reason);
      return dispute;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create dispute');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createDispute, isLoading, error };
}

/**
 * Hook for logging in
 */
export function useLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const login = useCallback(async (idToken: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiClient.login(idToken);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Login failed');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { login, isLoading, error };
}

/**
 * Hook for registering
 */
export function useRegister() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const register = useCallback(async (email: string, password: string, name: string, role: 'customer' | 'worker') => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiClient.register(email, password, name, role);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Registration failed');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { register, isLoading, error };
}

/**
 * Hook for logout
 */
export function useLogout() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      await apiClient.logout();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Logout failed');
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { logout, isLoading, error };
}

/**
 * Hook for updating user profile
 */
export function useUpdateProfile() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateProfile = useCallback(async (updates: Partial<User>) => {
    try {
      setIsLoading(true);
      setError(null);
      const user = await apiClient.updateProfile(updates);
      return user;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update profile');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { updateProfile, isLoading, error };
}
