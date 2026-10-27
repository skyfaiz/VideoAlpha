import axios from 'axios';

const API_BASE = '/api';

export interface Job {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  output_path: string | null;
  error: string | null;
}

// Infinitetalk API
export async function submitInfinitetalkJob(formData: FormData): Promise<{ job_id: string }> {
  const response = await axios.post(`${API_BASE}/infinitetalk/submit`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function getInfinitetalkStatus(jobId: string): Promise<Job> {
  const response = await axios.get(`${API_BASE}/infinitetalk/status/${jobId}`);
  return response.data;
}

export function getInfinitetalkDownloadUrl(jobId: string, customName?: string): string {
  let url = `${API_BASE}/infinitetalk/download/${jobId}`;
  if (customName) {
    url += `?custom_name=${encodeURIComponent(customName)}`;
  }
  return url;
}

// WanAnimate API
export async function submitWanAnimateJob(formData: FormData): Promise<{ job_id: string }> {
  const response = await axios.post(`${API_BASE}/wananimate/submit`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function getWanAnimateStatus(jobId: string): Promise<Job> {
  const response = await axios.get(`${API_BASE}/wananimate/status/${jobId}`);
  return response.data;
}

export function getWanAnimateDownloadUrl(jobId: string, customName?: string): string {
  let url = `${API_BASE}/wananimate/download/${jobId}`;
  if (customName) {
    url += `?custom_name=${encodeURIComponent(customName)}`;
  }
  return url;
}

// Job storage for persistent tracking
const JOBS_STORAGE_KEY = 'videoalpha_jobs';

export interface StoredJob {
  id: string;
  type: string;
  name: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export function getStoredJobs(): StoredJob[] {
  try {
    const stored = localStorage.getItem(JOBS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveJob(job: StoredJob): void {
  const jobs = getStoredJobs();
  const existingIndex = jobs.findIndex(j => j.id === job.id);
  if (existingIndex >= 0) {
    jobs[existingIndex] = job;
  } else {
    jobs.unshift(job);
  }
  // Keep only last 50 jobs
  localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs.slice(0, 50)));
}

export function updateJobStatus(jobId: string, updates: Partial<StoredJob>): void {
  const jobs = getStoredJobs();
  const job = jobs.find(j => j.id === jobId);
  if (job) {
    Object.assign(job, updates);
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  }
}
