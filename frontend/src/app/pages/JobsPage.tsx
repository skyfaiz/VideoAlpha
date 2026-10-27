import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Film, Download, RefreshCw, Trash2, CheckCircle, XCircle,
  Loader, Clock, Search, Play, Plus, Sparkles
} from 'lucide-react';
import {
  getStoredJobs,
  syncJobsWithBackend,
  deleteInfinitetalkJob,
  removeStoredJob,
  getInfinitetalkDownloadUrl,
  formatRelativeTime,
  type StoredJob
} from '../services/api';

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, color: '#22c55e', label: 'Completed', bg: 'rgba(34,197,94,0.12)' },
  processing: { icon: Loader, color: '#8B5CF6', label: 'Processing', bg: 'rgba(139,92,246,0.12)' },
  failed: { icon: XCircle, color: '#EF4444', label: 'Failed', bg: 'rgba(239,68,68,0.12)' },
  queued: { icon: Clock, color: '#F59E0B', label: 'Queued', bg: 'rgba(245,158,11,0.12)' },
};

const FILTERS = ['All', 'Processing', 'Completed', 'Failed', 'Queued'] as const;

export function JobsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [jobs, setJobs] = useState<StoredJob[]>(() => getStoredJobs());
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const updated = await syncJobsWithBackend();
      setJobs(updated);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUpdate = () => setJobs(getStoredJobs());
    window.addEventListener('videoalpha-jobs-updated', onUpdate);
    return () => window.removeEventListener('videoalpha-jobs-updated', onUpdate);
  }, [refresh]);

  // Poll backend while any job is active
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'processing' || j.status === 'queued');
    if (!hasActive) return;
    const interval = setInterval(() => {
      syncJobsWithBackend().then(setJobs);
    }, 3000);
    return () => clearInterval(interval);
  }, [jobs]);

  const handleDelete = async (id: string) => {
    removeStoredJob(id);
    setJobs(getStoredJobs());
    if (selected === id) setSelected(null);
    try {
      await deleteInfinitetalkJob(id);
    } catch {
      // Ignore 404 if job was only in local storage
    }
  };

  const filtered = jobs.filter(j => {
    const matchFilter = filter === 'All' || j.status === filter.toLowerCase();
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      j.name.toLowerCase().includes(q) ||
      j.id.toLowerCase().includes(q) ||
      j.type.toLowerCase().includes(q) ||
      (j.prompt && j.prompt.toLowerCase().includes(q));
    return matchFilter && matchSearch;
  });

  const counts = {
    All: jobs.length,
    Processing: jobs.filter(j => j.status === 'processing').length,
    Completed: jobs.filter(j => j.status === 'completed').length,
    Failed: jobs.filter(j => j.status === 'failed').length,
    Queued: jobs.filter(j => j.status === 'queued').length,
  };

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
    >
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-5">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }}>
              Submitted Jobs
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {counts.Processing > 0 && <span style={{ color: '#A78BFA' }}>{counts.Processing} processing · </span>}
              {counts.Queued > 0 && <span style={{ color: '#F59E0B' }}>{counts.Queued} queued · </span>}
              {counts.Completed} completed · {counts.Failed} failed
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div
              className="flex-1 sm:flex-initial flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                minWidth: 0,
                width: '100%',
                maxWidth: 260,
              }}
            >
              <Search size={13} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search submitted jobs..."
                style={{
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  fontSize: '12px',
                  color: '#E2E8F0',
                  width: '100%',
                }}
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={refresh}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
              }}
              title="Refresh jobs"
            >
              <RefreshCw
                size={14}
                className={refreshing ? 'animate-spin' : ''}
                style={{ color: 'rgba(255,255,255,0.5)' }}
              />
            </motion.button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {FILTERS.map(f => {
            const c = counts[f];
            const active = filter === f;
            return (
              <motion.button
                key={f}
                whileTap={{ scale: 0.97 }}
                onClick={() => setFilter(f)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl flex-shrink-0"
                style={{
                  background: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: active ? 600 : 400, color: active ? '#C4B5FD' : 'rgba(255,255,255,0.45)' }}>
                  {f}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: 20,
                    background: active ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)',
                    color: active ? '#A78BFA' : 'rgba(255,255,255,0.3)',
                    fontWeight: 600,
                  }}
                >
                  {c}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Jobs list */}
        <div className="grid grid-cols-1 gap-3">
          <AnimatePresence>
            {filtered.map((job, i) => {
              const st = STATUS_CONFIG[job.status];
              const isSelected = selected === job.id;
              const downloadUrl = job.status === 'completed' ? getInfinitetalkDownloadUrl(job.id) : null;
              const shortId = job.id.slice(0, 8);

              return (
                <motion.div
                  key={job.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ delay: i * 0.03, type: 'spring', stiffness: 280 }}
                  onClick={() => setSelected(isSelected ? null : job.id)}
                  className="rounded-2xl overflow-hidden cursor-pointer"
                  style={{
                    background: isSelected ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 sm:py-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Icon */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${st.color}15`, border: `1px solid ${st.color}25` }}
                      >
                        <Film size={16} style={{ color: st.color }} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#F1F5F9', fontFamily: 'monospace' }}>
                            #{shortId}
                          </span>
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>·</span>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#C4B5FD' }}>{job.type}</span>
                          {job.resolution && (
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '1px 7px',
                                borderRadius: 20,
                                background: 'rgba(255,255,255,0.06)',
                                color: 'rgba(255,255,255,0.45)',
                                border: '1px solid rgba(255,255,255,0.08)',
                              }}
                            >
                              {job.resolution}
                            </span>
                          )}
                        </div>
                        <div className="truncate" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                          {job.name}
                          {job.size ? ` · ${job.size}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Right controls row (wraps neatly on mobile) */}
                    <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                      {/* Status badge */}
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl flex-shrink-0"
                        style={{ background: st.bg, border: `1px solid ${st.color}25` }}
                      >
                        {job.status === 'processing' ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}>
                            <st.icon size={12} style={{ color: st.color }} />
                          </motion.div>
                        ) : (
                          <st.icon size={12} style={{ color: st.color }} />
                        )}
                        <span style={{ fontSize: '11px', fontWeight: 600, color: st.color }}>{st.label}</span>
                      </div>

                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                        {formatRelativeTime(job.createdAt)}
                      </span>

                      {/* Actions */}
                      <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {job.status === 'completed' && downloadUrl && (
                          <>
                            <motion.button
                              whileHover={{ scale: 1.08 }}
                              onClick={() => setSelected(isSelected ? null : job.id)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{
                                background: 'rgba(6,182,212,0.14)',
                                border: '1px solid rgba(6,182,212,0.3)',
                                cursor: 'pointer',
                              }}
                              title="Preview video"
                            >
                              <Play size={12} style={{ color: '#22D3EE' }} />
                            </motion.button>
                            <a
                              href={downloadUrl}
                              download
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{
                                background: 'rgba(139,92,246,0.16)',
                                border: '1px solid rgba(139,92,246,0.35)',
                                cursor: 'pointer',
                                textDecoration: 'none',
                              }}
                              title="Download MP4"
                            >
                              <Download size={12} style={{ color: '#C4B5FD' }} />
                            </a>
                          </>
                        )}
                        <motion.button
                          whileHover={{ scale: 1.08, background: 'rgba(239,68,68,0.2)' }}
                          onClick={() => handleDelete(job.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            cursor: 'pointer',
                          }}
                          title="Delete job"
                        >
                          <Trash2 size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />
                        </motion.button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 35 }}
                        style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="p-4 sm:px-5 sm:py-4 flex flex-col md:flex-row gap-4">
                          {job.status === 'completed' && downloadUrl && (
                            <div
                              className="rounded-xl overflow-hidden flex-shrink-0 w-full md:w-64"
                              style={{ background: '#000', border: '1px solid rgba(255,255,255,0.1)' }}
                            >
                              <video src={downloadUrl} controls style={{ width: '100%', maxHeight: 220, display: 'block' }} />
                            </div>
                          )}
                          <div className="flex-1 space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {[
                                { l: 'Job ID', v: job.id },
                                { l: 'Workflow', v: job.type },
                                { l: 'Resolution', v: job.resolution ?? '544×960' },
                                { l: 'Source', v: job.name },
                                { l: 'Submitted', v: formatRelativeTime(job.createdAt) },
                                { l: 'Size', v: job.size ?? '—' },
                              ].map(d => (
                                <div key={d.l} className="min-w-0">
                                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>{d.l}</div>
                                  <div className="truncate" style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E1', marginTop: 2 }}>
                                    {d.v}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {job.prompt && (
                              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>Prompt</div>
                                <div style={{ fontSize: '12px', color: '#E2E8F0' }}>{job.prompt}</div>
                              </div>
                            )}
                            {job.error && (
                              <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                                <div style={{ fontSize: '10px', color: '#F87171', marginBottom: 2 }}>Error</div>
                                <div style={{ fontSize: '12px', color: '#FCA5A5' }}>{job.error}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center py-14 px-4 text-center rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}
              >
                <Sparkles size={20} style={{ color: '#A78BFA' }} />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#E2E8F0' }}>
                {search || filter !== 'All' ? 'No matching jobs' : 'No jobs submitted yet'}
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: 4, maxWidth: 320 }}>
                {search || filter !== 'All'
                  ? 'Try adjusting your search or filter.'
                  : 'Jobs you submit in the Create tab will appear here with live status updates and video downloads.'}
              </div>
              {!search && filter === 'All' && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate('/workflow')}
                  className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl"
                  style={{
                    background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} className="text-white" />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>Create First Video</span>
                </motion.button>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
