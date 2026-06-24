import { Firestore, Timestamp, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { stateMachine, JobState } from './state-machine';
import { TrustScoreService } from './trust-score';
import { Job } from '../types';

export interface CreateJobInput {
  title: string;
  description: string;
  budget: number;
  currency?: string;
  deadline?: string;
  requiredSkills?: string[];
  metadata?: Record<string, unknown>;
}

export interface JobFilters {
  state?: JobState;
  workerId?: string;
  buyerId?: string;
  page?: number;
  limit?: number;
}

export class JobService {
  private trustScoreService: TrustScoreService;

  constructor(private db: Firestore) {
    this.trustScoreService = new TrustScoreService(db);
  }

  /**
   * Create a new job posting
   */
  async createJob(buyerId: string, input: CreateJobInput): Promise<any> {
    const jobId = uuidv4();
    const now = Timestamp.now();

    const jobData = {
      id: jobId,
      buyerId,
      title: input.title,
      description: input.description,
      budget: input.budget,
      currency: input.currency || 'USD',
      deadline: input.deadline ? Timestamp.fromDate(new Date(input.deadline)) : null,
      requiredSkills: input.requiredSkills || [],
      state: JobState.CREATED,
      status: 'active', // For filtering
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
      timestamps: {
        created: now,
        funded: null,
        inProgress: null,
        evidenceSubmitted: null,
        verified: null,
        released: null,
        disputed: null,
        completed: null,
      },
    };

    // Store in Firestore
    await this.db.collection('jobs').doc(jobId).set(jobData);

    // Log to audit trail
    await this.db.collection('jobAudit').add({
      jobId,
      action: 'CREATED',
      actor: buyerId,
      timestamp: now,
    });

    return jobData;
  }

  /**
   * Get a single job with full details
   */
  async getJob(jobId: string): Promise<any> {
    const doc = await this.db.collection('jobs').doc(jobId).get();
    if (!doc.exists) {
      throw new Error(`Job ${jobId} not found`);
    }
    return doc.data();
  }

  /**
   * List jobs with filtering and pagination
   */
  async listJobs(filters: JobFilters = {}): Promise<{ jobs: any[]; total: number }> {
    const pageNum = filters.page || 1;
    const pageSize = Math.min(filters.limit || 20, 100); // Max 100
    const offset = (pageNum - 1) * pageSize;

    let query = this.db.collection('jobs') as any;

    // Apply filters
    if (filters.state) {
      query = query.where('state', '==', filters.state);
    }
    if (filters.buyerId) {
      query = query.where('buyerId', '==', filters.buyerId);
    }
    if (filters.workerId) {
      query = query.where('workerId', '==', filters.workerId);
    }

    // Get total count
    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    // Get paginated results
    const snapshot = await query.orderBy('createdAt', 'desc').limit(pageSize).offset(offset).get();

    const jobs = snapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data() as Job);

    return { jobs, total };
  }

  /**
   * Worker accepts a job - transitions state from CREATED to FUNDED
   */
  async acceptJob(jobId: string, workerId: string): Promise<any> {
    const jobRef = this.db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      throw new Error(`Job ${jobId} not found`);
    }

    const job = jobDoc.data() as Job;

    // Validate state transition
    if (job.state !== JobState.CREATED) {
      throw new Error(`Cannot accept job in state ${job.state}. Job must be in CREATED state.`);
    }

    // Update job with worker info
    const now = Timestamp.now();
    const newState = JobState.FUNDED;

    await jobRef.update({
      workerId,
      state: newState,
      status: 'funded',
      'timestamps.funded': now,
      updatedAt: now,
    });

    // Log to audit trail
    await this.db.collection('jobAudit').add({
      jobId,
      action: 'ACCEPTED',
      actor: workerId,
      newState,
      timestamp: now,
    });

    // Trust score will be recalculated asynchronously via background job
    return this.getJob(jobId);
  }

  /**
   * Worker starts work - transitions state from FUNDED to IN_PROGRESS
   */
  async startJob(jobId: string, workerId: string): Promise<any> {
    const jobRef = this.db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      throw new Error(`Job ${jobId} not found`);
    }

    const job = jobDoc.data() as Job;

    // Verify worker is assigned
    if ((job as any).workerId !== workerId) {
      throw new Error('Worker is not assigned to this job');
    }

    // Validate state transition
    if (job.state !== JobState.FUNDED) {
      throw new Error(`Cannot start job in state ${job.state}. Job must be in FUNDED state.`);
    }

    const now = Timestamp.now();
    const newState = JobState.IN_PROGRESS;

    await jobRef.update({
      state: newState,
      status: 'in_progress',
      'timestamps.inProgress': now,
      updatedAt: now,
    });

    // Log to audit trail
    await this.db.collection('jobAudit').add({
      jobId,
      action: 'STARTED',
      actor: workerId,
      newState,
      timestamp: now,
    });

    return this.getJob(jobId);
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string, userId: string): Promise<any> {
    const jobRef = this.db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      throw new Error(`Job ${jobId} not found`);
    }

    const job = jobDoc.data() as Job;

    // Only buyer or admin can cancel
    if (job.buyerId !== userId) {
      throw new Error('Only job buyer can cancel the job');
    }

    // Cannot cancel if already completed or disputed
    const nonCancelableStates = [JobState.VERIFIED, JobState.RELEASED, JobState.DISPUTED];
    if (nonCancelableStates.includes(job.state)) {
      throw new Error(`Cannot cancel job in state ${job.state}`);
    }

    const now = Timestamp.now();
    const previousState = job.state;

    // Determine new state based on current state
    let newState = JobState.CANCELLED;
    if (job.state === JobState.FUNDED || job.state === JobState.IN_PROGRESS) {
      newState = JobState.REFUNDED;
    }

    await jobRef.update({
      state: newState,
      status: 'cancelled',
      previousState,
      'timestamps.completed': now,
      updatedAt: now,
    });

    // Log to audit trail
    await this.db.collection('jobAudit').add({
      jobId,
      action: 'CANCELLED',
      actor: userId,
      previousState,
      newState,
      timestamp: now,
    });

    return this.getJob(jobId);
  }

  /**
   * Get worker's assigned jobs
   */
  async getWorkerJobs(workerId: string, page: number = 1, limit: number = 20): Promise<any> {
    return this.listJobs({
      workerId,
      page,
      limit,
    });
  }

  /**
   * Get customer's posted jobs
   */
  async getCustomerJobs(buyerId: string, page: number = 1, limit: number = 20): Promise<any> {
    return this.listJobs({
      buyerId,
      page,
      limit,
    });
  }
}
