"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobService = void 0;
const firestore_1 = require("firebase-admin/firestore");
const uuid_1 = require("uuid");
const state_machine_1 = require("./state-machine");
const trust_score_1 = require("./trust-score");
class JobService {
    constructor(db) {
        this.db = db;
        this.trustScoreService = new trust_score_1.TrustScoreService(db);
    }
    /**
     * Create a new job posting
     */
    async createJob(buyerId, input) {
        const jobId = (0, uuid_1.v4)();
        const now = firestore_1.Timestamp.now();
        const jobData = {
            id: jobId,
            buyerId,
            title: input.title,
            description: input.description,
            budget: input.budget,
            currency: input.currency || 'USD',
            deadline: input.deadline ? firestore_1.Timestamp.fromDate(new Date(input.deadline)) : null,
            requiredSkills: input.requiredSkills || [],
            state: state_machine_1.JobState.CREATED,
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
    async getJob(jobId) {
        const doc = await this.db.collection('jobs').doc(jobId).get();
        if (!doc.exists) {
            throw new Error(`Job ${jobId} not found`);
        }
        return doc.data();
    }
    /**
     * List jobs with filtering and pagination
     */
    async listJobs(filters = {}) {
        const pageNum = filters.page || 1;
        const pageSize = Math.min(filters.limit || 20, 100); // Max 100
        const offset = (pageNum - 1) * pageSize;
        let query = this.db.collection('jobs');
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
        const jobs = snapshot.docs.map((doc) => doc.data());
        return { jobs, total };
    }
    /**
     * Worker accepts a job - transitions state from CREATED to FUNDED
     */
    async acceptJob(jobId, workerId) {
        const jobRef = this.db.collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            throw new Error(`Job ${jobId} not found`);
        }
        const job = jobDoc.data();
        // Validate state transition
        if (job.state !== state_machine_1.JobState.CREATED) {
            throw new Error(`Cannot accept job in state ${job.state}. Job must be in CREATED state.`);
        }
        // Update job with worker info
        const now = firestore_1.Timestamp.now();
        const newState = state_machine_1.JobState.FUNDED;
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
    async startJob(jobId, workerId) {
        const jobRef = this.db.collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            throw new Error(`Job ${jobId} not found`);
        }
        const job = jobDoc.data();
        // Verify worker is assigned
        if (job.workerId !== workerId) {
            throw new Error('Worker is not assigned to this job');
        }
        // Validate state transition
        if (job.state !== state_machine_1.JobState.FUNDED) {
            throw new Error(`Cannot start job in state ${job.state}. Job must be in FUNDED state.`);
        }
        const now = firestore_1.Timestamp.now();
        const newState = state_machine_1.JobState.IN_PROGRESS;
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
    async cancelJob(jobId, userId) {
        const jobRef = this.db.collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            throw new Error(`Job ${jobId} not found`);
        }
        const job = jobDoc.data();
        // Only buyer or admin can cancel
        if (job.buyerId !== userId) {
            throw new Error('Only job buyer can cancel the job');
        }
        // Cannot cancel if already completed or disputed
        const nonCancelableStates = [state_machine_1.JobState.VERIFIED, state_machine_1.JobState.RELEASED, state_machine_1.JobState.DISPUTED];
        if (nonCancelableStates.includes(job.state)) {
            throw new Error(`Cannot cancel job in state ${job.state}`);
        }
        const now = firestore_1.Timestamp.now();
        const previousState = job.state;
        // Determine new state based on current state
        let newState = state_machine_1.JobState.CANCELLED;
        if (job.state === state_machine_1.JobState.FUNDED || job.state === state_machine_1.JobState.IN_PROGRESS) {
            newState = state_machine_1.JobState.REFUNDED;
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
    async getWorkerJobs(workerId, page = 1, limit = 20) {
        return this.listJobs({
            workerId,
            page,
            limit,
        });
    }
    /**
     * Get customer's posted jobs
     */
    async getCustomerJobs(buyerId, page = 1, limit = 20) {
        return this.listJobs({
            buyerId,
            page,
            limit,
        });
    }
}
exports.JobService = JobService;
