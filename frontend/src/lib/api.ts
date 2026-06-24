import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * API Client for Magic Handshake Backend
 * Handles authentication, error handling, and request formatting
 */

let idTokenProvider: (() => Promise<string | null>) | null = null;

export function setIdTokenProvider(provider: () => Promise<string | null>) {
  idTokenProvider = provider;
}

export interface ApiConfig {
  baseUrl?: string;
  timeout?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Types for API requests/responses
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'customer' | 'worker' | 'admin';
  phone?: string;
  bio?: string;
  skills?: string[];
  trustScore: number;
  jobsCompleted: number;
  totalEarnings: number;
  accountStatus: 'active' | 'suspended' | 'banned';
  createdAt: string;
  updatedAt?: string;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  budget: number;
  buyerId: string;
  buyerName?: string;
  freelancerId?: string;
  freelancerName?: string;
  status: 'CREATED' | 'FUNDED' | 'IN_PROGRESS' | 'EVIDENCE_SUBMITTED' | 'VERIFIED' | 'RELEASED' | 'DISPUTED' | 'CANCELLED' | 'REFUNDED';
  deadline?: string;
  requirements?: string[];
  evidenceCount?: number;
  verificationScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobCreateRequest {
  title: string;
  description: string;
  budget: number;
  deadline?: string;
  requirements?: string[];
}

export interface Evidence {
  id: string;
  jobId: string;
  imageUrl: string;
  latitude?: number;
  longitude?: number;
  timestamp: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  aiVerificationScore?: number;
  createdAt: string;
}

export interface Dispute {
  id: string;
  jobId: string;
  buyerId: string;
  freelancerId: string;
  reason: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  resolution?: 'RELEASE' | 'REFUND';
  verdict?: string;
  aiConfidence?: number;
  createdAt: string;
  updatedAt: string;
}

export class MagicHandshakeAPI {
  private client: AxiosInstance;
  private token: string | null = null;
  private userId: string | null = null;
  private idempotencyKeys: Map<string, string> = new Map();

  constructor(config: ApiConfig = {}) {
    const baseUrl = config.baseUrl || import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth interceptor
    this.client.interceptors.request.use(async (config) => {
      if (idTokenProvider) {
        const token = await idTokenProvider();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    });

    // Handle 401 errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Unauthorized - redirect to login
          window.location.href = '/sign-in';
        }
        return Promise.reject(error);
      }
    );

    // Add request interceptor to attach auth token and idempotency key
    this.client.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        if (this.userId) {
          config.headers['x-user-id'] = this.userId;
        }
        // Add idempotency key for POST/PUT/PATCH requests
        if (config.method && ['post', 'put', 'patch'].includes(config.method)) {
          const idempotencyKey = this.getOrCreateIdempotencyKey(config);
          if (idempotencyKey) {
            config.headers['Idempotency-Key'] = idempotencyKey;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string, userId: string) {
    this.token = token;
    this.userId = userId;
  }

  /**
   * Clear authentication
   */
  clearAuth() {
    this.token = null;
    this.userId = null;
  }

  /**
   * Generate or retrieve idempotency key for a request
   * Creates unique key based on method, URL, and request body to ensure idempotency
   */
  private getOrCreateIdempotencyKey(config: any): string {
    // Create a unique key based on the request details
    const url = config.url || '';
    const method = config.method || '';
    const data = config.data ? JSON.stringify(config.data) : '';
    
    // Simple hash of request details
    const requestHash = `${method}-${url}-${data}`.substring(0, 100);
    const keyPrefix = `${url.split('/').pop()}-${method}`;
    
    // Check if we already have this key stored (for retries)
    if (this.idempotencyKeys.has(requestHash)) {
      return this.idempotencyKeys.get(requestHash)!;
    }
    
    // Generate new UUID-like idempotency key
    const idempotencyKey = `${keyPrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store for potential retries
    this.idempotencyKeys.set(requestHash, idempotencyKey);
    
    return idempotencyKey;
  }

  /**
   * Clear idempotency key cache (call after successful request)
   */
  clearIdempotencyCache() {
    // Keep cache for a short time to handle retries, but clear old entries
    // In practice, this could be enhanced with TTL logic
    if (this.idempotencyKeys.size > 100) {
      // Prevent unbounded growth
      this.idempotencyKeys.clear();
    }
  }

  /**
   * Handle API errors
   */
  private handleError(error: AxiosError) {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear auth
      this.clearAuth();
      // Trigger logout or redirect to login
      window.location.href = '/sign-in';
    }
    console.error('[API Error]', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
  }

  // ============================================
  // AUTHENTICATION ENDPOINTS
  // ============================================

  async register(email: string, password: string, name: string, role: 'customer' | 'worker') {
    try {
      const response = await this.client.post<ApiResponse<{ user: User }>>('/auth/register', {
        email,
        password,
        name,
        role,
      });
      return response.data.data;
    } catch (error) {
      console.error('[Register Error]', error);
      throw error;
    }
  }

  async login(idToken: string) {
    try {
      const response = await this.client.post<ApiResponse<{ user: User; token: string }>>('/auth/login', {
        idToken,
      });
      const data = response.data.data;
      if (data?.token && data?.user) {
        this.setAuthToken(data.token, data.user.id);
      }
      return data;
    } catch (error) {
      console.error('[Login Error]', error);
      throw error;
    }
  }

  async getCurrentUser(): Promise<User> {
    try {
      const response = await this.client.get<ApiResponse<{ user: User }>>('/auth/me');
      return response.data.data!.user;
    } catch (error) {
      console.error('[Get Current User Error]', error);
      throw error;
    }
  }

  async updateProfile(updates: Partial<User>) {
    try {
      const response = await this.client.put<ApiResponse<{ user: User }>>('/auth/profile', updates);
      return response.data.data!.user;
    } catch (error) {
      console.error('[Update Profile Error]', error);
      throw error;
    }
  }

  async logout() {
    try {
      await this.client.post('/auth/logout');
      this.clearAuth();
    } catch (error) {
      console.error('[Logout Error]', error);
      this.clearAuth();
    }
  }

  // ============================================
  // JOBS ENDPOINTS
  // ============================================

  async createJob(jobData: JobCreateRequest): Promise<Job> {
    try {
      const response = await this.client.post<ApiResponse<{ job: Job }>>('/jobs', jobData);
      return response.data.data!.job;
    } catch (error) {
      console.error('[Create Job Error]', error);
      throw error;
    }
  }

  async listJobs(params?: {
    status?: string;
    role?: 'customer' | 'worker';
    limit?: number;
    offset?: number;
  }): Promise<Job[]> {
    try {
      const response = await this.client.get<ApiResponse<{ jobs: Job[] }>>('/jobs', {
        params,
      });
      return response.data.data!.jobs;
    } catch (error) {
      console.error('[List Jobs Error]', error);
      throw error;
    }
  }

  async getJob(jobId: string): Promise<Job> {
    try {
      const response = await this.client.get<ApiResponse<{ job: Job }>>(`/jobs/${jobId}`);
      return response.data.data!.job;
    } catch (error) {
      console.error('[Get Job Error]', error);
      throw error;
    }
  }

  async acceptJob(jobId: string): Promise<Job> {
    try {
      const response = await this.client.put<ApiResponse<{ job: Job }>>(`/jobs/${jobId}/accept`);
      return response.data.data!.job;
    } catch (error) {
      console.error('[Accept Job Error]', error);
      throw error;
    }
  }

  async startJob(jobId: string): Promise<Job> {
    try {
      const response = await this.client.put<ApiResponse<{ job: Job }>>(`/jobs/${jobId}/start`);
      return response.data.data!.job;
    } catch (error) {
      console.error('[Start Job Error]', error);
      throw error;
    }
  }

  async cancelJob(jobId: string): Promise<Job> {
    try {
      const response = await this.client.put<ApiResponse<{ job: Job }>>(`/jobs/${jobId}/cancel`);
      return response.data.data!.job;
    } catch (error) {
      console.error('[Cancel Job Error]', error);
      throw error;
    }
  }

  // ============================================
  // EVIDENCE ENDPOINTS
  // ============================================

  async uploadEvidence(
    jobId: string,
    file: File,
    latitude?: number,
    longitude?: number
  ): Promise<{ evidenceId: string; hash: string; storageUrl: string; status: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('jobId', jobId);
      if (latitude !== undefined) formData.append('latitude', latitude.toString());
      if (longitude !== undefined) formData.append('longitude', longitude.toString());

      const response = await this.client.post<
        ApiResponse<{
          evidenceId: string;
          hash: string;
          storageUrl: string;
          status: string;
        }>
      >('/evidence/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      return response.data.data!;
    } catch (error) {
      console.error('[Upload Evidence Error]', error);
      throw error;
    }
  }

  async getEvidence(jobId: string): Promise<Evidence[]> {
    try {
      const response = await this.client.get<ApiResponse<{ evidence: Evidence[] }>>('/evidence', {
        params: { jobId },
      });
      return response.data.data!.evidence;
    } catch (error) {
      console.error('[Get Evidence Error]', error);
      throw error;
    }
  }

  // ============================================
  // DISPUTES ENDPOINTS
  // ============================================

  async createDispute(jobId: string, reason: string): Promise<Dispute> {
    try {
      const response = await this.client.post<ApiResponse<{ dispute: Dispute }>>('/disputes/create', {
        jobId,
        reason,
      });
      return response.data.data!.dispute;
    } catch (error) {
      console.error('[Create Dispute Error]', error);
      throw error;
    }
  }

  async listDisputes(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Dispute[]> {
    try {
      const response = await this.client.get<ApiResponse<{ disputes: Dispute[] }>>('/disputes/pending', {
        params,
      });
      return response.data.data!.disputes;
    } catch (error) {
      console.error('[List Disputes Error]', error);
      throw error;
    }
  }

  async getDispute(jobId: string): Promise<Dispute> {
    try {
      const response = await this.client.get<ApiResponse<{ dispute: Dispute }>>(`/disputes/${jobId}`);
      return response.data.data!.dispute;
    } catch (error) {
      console.error('[Get Dispute Error]', error);
      throw error;
    }
  }

  async resolveDispute(disputeId: string, resolution: 'RELEASE' | 'REFUND'): Promise<Dispute> {
    try {
      const response = await this.client.post<ApiResponse<{ dispute: Dispute }>>(`/disputes/${disputeId}/resolve`, {
        resolution,
      });
      return response.data.data!.dispute;
    } catch (error) {
      console.error('[Resolve Dispute Error]', error);
      throw error;
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get trust score for a user
   */
  async getTrustScore(userId: string): Promise<number> {
    try {
      const response = await this.client.get<ApiResponse<{ score: number }>>(`/trust-score/${userId}`);
      return response.data.data!.score;
    } catch (error) {
      console.error('[Get Trust Score Error]', error);
      return 50; // Default score on error
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.client.defaults.baseURL?.replace('/api', '')}/health`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      console.error('[Health Check Error]', error);
      return false;
    }
  }
}

// Create and export singleton instance
export const apiClient = new MagicHandshakeAPI();

// Export for use in React components
export default apiClient;
