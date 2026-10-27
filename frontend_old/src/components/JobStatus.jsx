import { useEffect, useState } from 'react';
import { Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function JobStatus({ jobId, status, error, getStatusFn, onStatusChange }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!jobId || status === 'COMPLETED' || status === 'FAILED') return;

    const statusInterval = setInterval(async () => {
      try {
        const res = await getStatusFn(jobId);
        onStatusChange(res.data.status, res.data.error);
      } catch (err) {
        console.error('Error checking status:', err);
      }
    }, 5000);

    return () => clearInterval(statusInterval);
  }, [jobId, status, getStatusFn, onStatusChange]);

  useEffect(() => {
    if (!jobId || status === 'COMPLETED' || status === 'FAILED') return;

    const timerInterval = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [jobId, status]);

  useEffect(() => {
    if (jobId) {
      setElapsed(0);
    }
  }, [jobId]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'FAILED':
        return <XCircle className="w-6 h-6 text-red-500" />;
      case 'IN_PROGRESS':
      case 'IN_QUEUE':
        return <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-6 h-6 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'FAILED':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'IN_PROGRESS':
      case 'IN_QUEUE':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  if (!jobId) return null;

  return (
    <div className={`rounded-lg border p-4 ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <p className="font-medium">Status: {status}</p>
            <p className="text-sm opacity-75">Job ID: {jobId.slice(0, 8)}...</p>
          </div>
        </div>
        {(status === 'IN_PROGRESS' || status === 'IN_QUEUE') && (
          <div className="text-right">
            <p className="text-sm font-medium">Elapsed</p>
            <p className="text-lg font-mono">{formatTime(elapsed)}</p>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-3 p-2 bg-red-100 rounded text-red-700 text-sm">
          Error: {error}
        </div>
      )}
    </div>
  );
}
