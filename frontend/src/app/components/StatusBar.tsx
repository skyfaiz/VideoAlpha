import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Loader, CheckCircle2 } from 'lucide-react';
import { getStoredJobs, syncJobsWithBackend, type StoredJob } from '../services/api';

export function StatusBar() {
  const [jobs, setJobs] = useState<StoredJob[]>(() => getStoredJobs());

  useEffect(() => {
    syncJobsWithBackend().then(setJobs);
    const onUpdate = () => setJobs(getStoredJobs());
    window.addEventListener('videoalpha-jobs-updated', onUpdate);
    const interval = setInterval(() => {
      const current = getStoredJobs();
      if (current.some(j => j.status === 'processing' || j.status === 'queued')) {
        syncJobsWithBackend().then(setJobs);
      }
    }, 4000);
    return () => {
      window.removeEventListener('videoalpha-jobs-updated', onUpdate);
      clearInterval(interval);
    };
  }, []);

  const activeJob = jobs.find(j => j.status === 'processing' || j.status === 'queued') ?? null;
  const completedCount = jobs.filter(j => j.status === 'completed').length;

  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-6"
      style={{
        height: 40,
        background: 'rgba(10,16,32,0.95)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        zIndex: 30,
      }}
    >
      {/* Left: Real job status */}
      <div className="flex items-center gap-4 min-w-0">
        <AnimatePresence mode="wait">
          {activeJob ? (
            <motion.div
              key={activeJob.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-2.5 min-w-0"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
              >
                <Loader size={12} style={{ color: '#8B5CF6' }} />
              </motion.div>
              <span className="truncate" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                <span style={{ color: '#C4B5FD', fontWeight: 600 }}>{activeJob.type}</span>
                {' · '}{activeJob.name}
              </span>
              <span style={{ fontSize: '10px', color: '#A78BFA', textTransform: 'capitalize' }}>
                ({activeJob.status})
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2"
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                Ready · {completedCount} completed job{completedCount === 1 ? '' : 's'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: Endpoint status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={11} style={{ color: '#06B6D4' }} />
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
            S3 Volume: c19b1cqixg (eu-ro-1)
          </span>
        </div>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.06)' }} />
        <div className="flex items-center gap-1.5">
          <Activity size={11} style={{ color: '#22c55e' }} />
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
            RunPod Serverless · Online
          </span>
        </div>
      </div>
    </div>
  );
}
