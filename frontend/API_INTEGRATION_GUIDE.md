# Frontend-Backend API Integration Guide

This guide explains how to replace mock data with real API calls in the Magic Handshake frontend.

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install axios swr
```

### 2. Setup Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Update with your configuration:
```
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_FIREBASE_API_KEY=...
```

### 3. Initialize Firebase (in your root component)

```tsx
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
```

## API Integration Examples

### Example 1: Fetch Jobs List

**Before (Mock Data):**
```tsx
import { customerJobs } from '@/lib/mock-data';

export function JobsList() {
  const jobs = customerJobs;
  
  return (
    <div>
      {jobs.map(job => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
```

**After (Real API):**
```tsx
import { useJobs } from '@/hooks/useApi';

export function JobsList() {
  const { jobs, isLoading, error } = useJobs({
    role: 'customer',
    status: 'VERIFIED'
  });
  
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return (
    <div>
      {jobs?.map(job => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
```

### Example 2: Create a Job

**Before (Mock):**
```tsx
function PostJobForm() {
  const handleSubmit = (data) => {
    console.log('Would create job:', data);
    // Navigate to dashboard
  };
  
  return <form onSubmit={handleSubmit}>{/* form fields */}</form>;
}
```

**After (Real API):**
```tsx
import { useCreateJob } from '@/hooks/useApi';
import { useNavigate } from 'react-router-dom';

function PostJobForm() {
  const { createJob, isLoading, error } = useCreateJob();
  const navigate = useNavigate();
  
  const handleSubmit = async (data) => {
    try {
      const job = await createJob(
        data.title,
        data.description,
        data.budget,
        data.deadline,
        data.requirements
      );
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      console.error('Failed to create job:', err);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      {error && <ErrorMessage error={error} />}
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Post Job'}
      </button>
    </form>
  );
}
```

### Example 3: User Authentication

**Before (Mock):**
```tsx
function SignInPage() {
  const handleSignIn = (email, password) => {
    // Mock login
    localStorage.setItem('user', JSON.stringify({ email }));
    navigate('/dashboard');
  };
  
  return <SignInForm onSubmit={handleSignIn} />;
}
```

**After (Real API with Firebase):**
```tsx
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useLogin } from '@/hooks/useApi';
import { useNavigate } from 'react-router-dom';

function SignInPage() {
  const { login } = useLogin();
  const navigate = useNavigate();
  
  const handleSignIn = async (email: string, password: string) => {
    try {
      // Authenticate with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();
      
      // Login to our backend
      const response = await login(idToken);
      
      // Store token in localStorage or session
      localStorage.setItem('authToken', idToken);
      localStorage.setItem('userId', response.user.id);
      
      navigate('/dashboard');
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };
  
  return <SignInForm onSubmit={handleSignIn} />;
}
```

### Example 4: Upload Evidence

**Before (Mock):**
```tsx
function EvidenceUpload({ jobId }) {
  const handleUpload = (file) => {
    console.log('Would upload:', file);
  };
  
  return <FileUploadInput onSelect={handleUpload} />;
}
```

**After (Real API):**
```tsx
import { useUploadEvidence } from '@/hooks/useApi';
import { useGeolocation } from '@/hooks/useGeolocation';

function EvidenceUpload({ jobId }) {
  const { uploadEvidence, isLoading, error } = useUploadEvidence();
  const { latitude, longitude } = useGeolocation();
  
  const handleUpload = async (file: File) => {
    try {
      const evidence = await uploadEvidence(
        jobId,
        file,
        latitude,
        longitude
      );
      console.log('Evidence uploaded:', evidence);
      // Show success and refresh evidence list
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };
  
  return (
    <div>
      <FileUploadInput 
        onSelect={handleUpload} 
        disabled={isLoading} 
      />
      {error && <ErrorMessage error={error} />}
    </div>
  );
}
```

### Example 5: Accept a Job

**Before (Mock):**
```tsx
function JobDetail({ jobId }) {
  const handleAccept = () => {
    console.log('Would accept job');
  };
  
  return <button onClick={handleAccept}>Accept Job</button>;
}
```

**After (Real API):**
```tsx
import { useAcceptJob } from '@/hooks/useApi';
import { useJob } from '@/hooks/useApi';

function JobDetail({ jobId }) {
  const { job, mutate: refetchJob } = useJob(jobId);
  const { acceptJob, isLoading, error } = useAcceptJob();
  
  const handleAccept = async () => {
    try {
      const updatedJob = await acceptJob(jobId);
      // Update local state
      await refetchJob();
      console.log('Job accepted successfully');
    } catch (err) {
      console.error('Failed to accept job:', err);
    }
  };
  
  return (
    <div>
      <JobInfo job={job} />
      {error && <ErrorMessage error={error} />}
      <button 
        onClick={handleAccept} 
        disabled={isLoading || !job}
      >
        {isLoading ? 'Accepting...' : 'Accept Job'}
      </button>
    </div>
  );
}
```

## API Endpoints Summary

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `GET /auth/me` - Get current user
- `PUT /auth/profile` - Update profile
- `POST /auth/logout` - Logout

### Jobs
- `POST /jobs` - Create job
- `GET /jobs` - List jobs
- `GET /jobs/:id` - Get job details
- `PUT /jobs/:id/accept` - Accept job
- `PUT /jobs/:id/start` - Start job
- `PUT /jobs/:id/cancel` - Cancel job

### Evidence
- `POST /evidence/upload` - Upload evidence
- `GET /evidence` - Get evidence for job

### Disputes
- `POST /disputes/create` - Create dispute
- `GET /disputes/:jobId` - Get dispute details
- `POST /disputes/:id/resolve` - Resolve dispute

## Error Handling

All API hooks provide error states:

```tsx
function MyComponent() {
  const { data, error, isLoading } = useJobs();
  
  if (isLoading) return <LoadingSpinner />;
  
  if (error) {
    return (
      <ErrorBoundary>
        <div className="error">
          <h3>Error: {error.message}</h3>
          <button onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </ErrorBoundary>
    );
  }
  
  return <Content data={data} />;
}
```

## Data Caching

All SWR hooks use automatic caching:

```tsx
// First call fetches from API
const { jobs } = useJobs();

// Second call returns cached data immediately
const { jobs } = useJobs();

// Manually refresh
const { mutate } = useJobs();
mutate(); // Refetch data
```

## Authentication Flow

1. User signs up/in with Firebase
2. Firebase returns ID token
3. Frontend sends ID token to backend (`/auth/login`)
4. Backend verifies token and returns session
5. Frontend stores token for future requests
6. All subsequent API calls include the token

## Migration Checklist

- [ ] Install axios and swr
- [ ] Setup environment variables
- [ ] Initialize Firebase in root component
- [ ] Replace mock data imports with API hooks
- [ ] Update authentication flow
- [ ] Test all API endpoints
- [ ] Remove mock-data.ts (once migration complete)
- [ ] Deploy frontend

## Testing API Integration

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev

# Test in browser: http://localhost:3000
```

## Troubleshooting

### "CORS error"
- Make sure backend is running on `http://localhost:3001`
- Check CORS is enabled in backend server.ts

### "401 Unauthorized"
- Token is missing or expired
- Make sure Firebase is initialized correctly
- Check `.env.local` has correct Firebase config

### "Cannot POST /jobs"
- Backend not running
- API endpoint not registered in server.ts
- Request body doesn't match schema

For more help, see [API_REFERENCE.md](../backend/API_REFERENCE.md)
