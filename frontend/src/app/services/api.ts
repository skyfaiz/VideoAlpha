import axios from 'axios';

const API_BASE = '/api';

export interface Job {
  job_id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  workflow_type?: string;
  input_type?: string;
  person_count?: string;
  name?: string;
  prompt?: string;
  resolution?: string;
  media_mode?: string;
  audio_mode?: string;
  created_at?: string;
  completed_at?: string | null;
  size?: string | null;
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

export async function getInfinitetalkJobs(): Promise<Job[]> {
  const response = await axios.get(`${API_BASE}/infinitetalk/jobs`);
  return response.data;
}

export async function deleteInfinitetalkJob(jobId: string): Promise<void> {
  await axios.delete(`${API_BASE}/infinitetalk/jobs/${jobId}`);
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
  prompt?: string;
  resolution?: string;
  size?: string | null;
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
    jobs[existingIndex] = { ...jobs[existingIndex], ...job };
  } else {
    jobs.unshift(job);
  }
  localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs.slice(0, 50)));
  window.dispatchEvent(new CustomEvent('videoalpha-jobs-updated'));
}

export function updateJobStatus(jobId: string, updates: Partial<StoredJob>): void {
  const jobs = getStoredJobs();
  const job = jobs.find(j => j.id === jobId);
  if (job) {
    Object.assign(job, updates);
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
    window.dispatchEvent(new CustomEvent('videoalpha-jobs-updated'));
  }
}

export function removeStoredJob(jobId: string): void {
  const jobs = getStoredJobs().filter(j => j.id !== jobId);
  localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  window.dispatchEvent(new CustomEvent('videoalpha-jobs-updated'));
}

export function mapBackendStatus(status: Job['status']): StoredJob['status'] {
  switch (status) {
    case 'COMPLETED':
      return 'completed';
    case 'IN_PROGRESS':
      return 'processing';
    case 'FAILED':
      return 'failed';
    default:
      return 'queued';
  }
}

export async function syncJobsWithBackend(): Promise<StoredJob[]> {
  try {
    const backendJobs = await getInfinitetalkJobs();
    const localMap = new Map(getStoredJobs().map(j => [j.id, j]));

    for (const bj of backendJobs) {
      const mappedStatus = mapBackendStatus(bj.status);
      const existing = localMap.get(bj.job_id);
      const updated: StoredJob = {
        id: bj.job_id,
        type: bj.workflow_type || existing?.type || 'I2V Single',
        name: bj.name || existing?.name || 'input_media',
        prompt: bj.prompt || existing?.prompt,
        resolution: bj.resolution || existing?.resolution || '544×960',
        size: bj.size ?? existing?.size ?? null,
        status: mappedStatus,
        progress:
          mappedStatus === 'completed'
            ? 100
            : mappedStatus === 'failed'
            ? 0
            : mappedStatus === 'processing'
            ? Math.max(existing?.progress ?? 40, 40)
            : 10,
        createdAt: bj.created_at || existing?.createdAt || new Date().toISOString(),
        completedAt: bj.completed_at || existing?.completedAt,
        error: bj.error || existing?.error,
      };
      localMap.set(bj.job_id, updated);
    }

    const merged = Array.from(localMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(merged.slice(0, 50)));
    return merged;
  } catch {
    return getStoredJobs();
  }
}

export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'just now';
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (isNaN(diffSec) || diffSec < 15) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
