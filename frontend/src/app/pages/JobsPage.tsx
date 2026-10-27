import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Film, Download, RefreshCw, Trash2, Eye, CheckCircle, XCircle, Loader, Clock, Filter, Search, Play } from 'lucide-react';

interface Job {
  id: string;
  type: string;
  name: string;
  status: 'completed' | 'processing' | 'failed' | 'queued';
  progress: number;
  duration: string | null;
  resolution: string;
  created: string;
  size: string | null;
  color: string;
  style: string;
}

const MOCK_JOBS: Job[] = [
  { id: '#044', type: 'I2V Single', name: 'beach_sunset.jpg', status: 'processing', progress: 67, duration: null, resolution: '1080p', created: '5m ago', size: null, color: '#8B5CF6', style: 'Cinematic' },
  { id: '#043', type: 'V2V Multi', name: 'dance_video.mp4', status: 'completed', progress: 100, duration: '3:24', resolution: '4K', created: '28m ago', size: '124 MB', color: '#22c55e', style: 'Animated' },
  { id: '#042', type: 'I2V Multi', name: 'portrait_group.jpg', status: 'completed', progress: 100, duration: '2:12', resolution: '1080p', created: '1h ago', size: '67 MB', color: '#22c55e', style: 'Realistic' },
  { id: '#041', type: 'V2V Single', name: 'action_clip.mp4', status: 'failed', progress: 0, duration: null, resolution: '720p', created: '3h ago', size: null, color: '#EF4444', style: 'Cinematic' },
  { id: '#040', type: 'I2V Single', name: 'cityscape.jpg', status: 'completed', progress: 100, duration: '1:48', resolution: '1080p', created: '5h ago', size: '45 MB', color: '#22c55e', style: 'Cinematic' },
  { id: '#039', type: 'I2V Single', name: 'portrait.jpg', status: 'completed', progress: 100, duration: '0:58', resolution: '720p', created: '8h ago', size: '22 MB', color: '#22c55e', style: 'Realistic' },
  { id: '#038', type: 'V2V Multi', name: 'group_dance.mp4', status: 'failed', progress: 0, duration: null, resolution: '4K', created: '1d ago', size: null, color: '#EF4444', style: 'Animated' },
  { id: '#037', type: 'I2V Multi', name: 'family_photo.jpg', status: 'completed', progress: 100, duration: '4:30', resolution: '4K', created: '1d ago', size: '210 MB', color: '#22c55e', style: 'Cinematic' },
  { id: '#036', type: 'I2V Single', name: 'athlete.jpg', status: 'queued', progress: 0, duration: null, resolution: '1080p', created: 'just now', size: null, color: '#F59E0B', style: 'Realistic' },
];

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, color: '#22c55e', label: 'Completed', bg: 'rgba(34,197,94,0.12)' },
  processing: { icon: Loader, color: '#8B5CF6', label: 'Processing', bg: 'rgba(139,92,246,0.12)' },
  failed: { icon: XCircle, color: '#EF4444', label: 'Failed', bg: 'rgba(239,68,68,0.12)' },
  queued: { icon: Clock, color: '#F59E0B', label: 'Queued', bg: 'rgba(245,158,11,0.12)' },
};

const FILTERS = ['All', 'Processing', 'Completed', 'Failed', 'Queued'];

export function JobsPage() {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [jobs, setJobs] = useState(MOCK_JOBS);
  const [selected, setSelected] = useState<string | null>(null);

  // Simulate processing job progress
  useEffect(() => {
    const interval = setInterval(() => {
      setJobs(prev => prev.map(j =>
        j.status === 'processing'
          ? { ...j, progress: Math.min(j.progress + Math.random() * 3, 100) }
          : j
      ));
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const filtered = jobs.filter(j => {
    const matchFilter = filter === 'All' || j.status === filter.toLowerCase();
    const matchSearch = j.name.toLowerCase().includes(search.toLowerCase()) || j.id.includes(search) || j.type.toLowerCase().includes(search.toLowerCase());
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
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }}>Job Queue</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
            {counts.Processing > 0 && <span style={{ color: '#A78BFA' }}>{counts.Processing} processing · </span>}
            {counts.Completed} completed · {counts.Failed} failed
          </div>
        </div>
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', width: 220 }}>
          <Search size={13} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs..."
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: '12px', color: '#E2E8F0', width: '100%' }}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {FILTERS.map(f => {
          const c = counts[f as keyof typeof counts];
          const active = filter === f;
          return (
            <motion.button
              key={f}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setFilter(f)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
              style={{
                background: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: active ? 600 : 400, color: active ? '#C4B5FD' : 'rgba(255,255,255,0.45)' }}>{f}</span>
              <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: 20, background: active ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)', color: active ? '#A78BFA' : 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{c}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Jobs grid */}
      <div className="grid grid-cols-1 gap-3">
        <AnimatePresence>
          {filtered.map((job, i) => {
            const st = STATUS_CONFIG[job.status];
            const isSelected = selected === job.id;
            return (
              <motion.div
                key={job.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 280 }}
                onClick={() => setSelected(isSelected ? null : job.id)}
                className="rounded-2xl overflow-hidden cursor-pointer"
                style={{
                  background: isSelected ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isSelected ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={e => !isSelected && (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={e => !isSelected && (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${st.color}15`, border: `1px solid ${st.color}25` }}>
                    <Film size={16} style={{ color: st.color }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#F1F5F9' }}>{job.id}</span>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>·</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{job.type}</span>
                      <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>{job.style}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{job.name} · {job.resolution}</div>
                  </div>

                  {/* Progress bar for processing */}
                  {job.status === 'processing' && (
                    <div className="w-28 flex-shrink-0">
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Progress</span>
                        <span style={{ fontSize: '10px', color: '#A78BFA', fontVariantNumeric: 'tabular-nums' }}>{Math.round(job.progress)}%</span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.08)' }}>
                        <motion.div
                          animate={{ width: `${job.progress}%` }}
                          style={{ height: '100%', background: 'linear-gradient(90deg, #8B5CF6, #06B6D4)', borderRadius: 99 }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Duration/size */}
                  {job.status === 'completed' && (
                    <div className="text-right flex-shrink-0">
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>{job.duration}</div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{job.size}</div>
                    </div>
                  )}

                  {/* Status badge */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl flex-shrink-0"
                    style={{ background: st.bg, border: `1px solid ${st.color}25` }}>
                    {job.status === 'processing' ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}>
                        <st.icon size={12} style={{ color: st.color }} />
                      </motion.div>
                    ) : (
                      <st.icon size={12} style={{ color: st.color }} />
                    )}
                    <span style={{ fontSize: '11px', fontWeight: 600, color: st.color }}>{st.label}</span>
                  </div>

                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>{job.created}</span>

                  {/* Actions */}
                  <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {job.status === 'completed' && (
                      <>
                        <motion.button
                          whileHover={{ scale: 1.12, background: 'rgba(6,182,212,0.2)' }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
                        >
                          <Play size={11} style={{ color: '#22D3EE' }} />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.12, background: 'rgba(139,92,246,0.2)' }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
                        >
                          <Download size={11} style={{ color: '#A78BFA' }} />
                        </motion.button>
                      </>
                    )}
                    {job.status === 'failed' && (
                      <motion.button
                        whileHover={{ scale: 1.12, background: 'rgba(139,92,246,0.2)' }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
                      >
                        <RefreshCw size={11} style={{ color: '#A78BFA' }} />
                      </motion.button>
                    )}
                    <motion.button
                      whileHover={{ scale: 1.12, background: 'rgba(239,68,68,0.2)' }}
                      onClick={() => setJobs(prev => prev.filter(j => j.id !== job.id))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}
                    >
                      <Trash2 size={11} style={{ color: 'rgba(255,255,255,0.3)' }} />
                    </motion.button>
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
                    >
                      <div className="px-5 py-4 flex gap-6">
                        {/* Video preview placeholder */}
                        <div className="rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ width: 120, height: 70, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <Play size={20} style={{ color: 'rgba(255,255,255,0.3)' }} />
                        </div>
                        <div className="flex-1 grid grid-cols-3 gap-3">
                          {[
                            { l: 'Job ID', v: job.id },
                            { l: 'Type', v: job.type },
                            { l: 'Resolution', v: job.resolution },
                            { l: 'Style', v: job.style },
                            { l: 'Created', v: job.created },
                            { l: 'Duration', v: job.duration ?? 'N/A' },
                          ].map(d => (
                            <div key={d.l}>
                              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{d.l}</div>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E1', marginTop: 2 }}>{d.v}</div>
                            </div>
                          ))}
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
            className="flex flex-col items-center py-16"
          >
            <div style={{ fontSize: '40px', marginBottom: 12 }}>🎬</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>No jobs found</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
              {search ? 'Try a different search term' : 'Start a new generation to see jobs here'}
            </div>
          </motion.div>
        )}
      </div>
    </div>
    </div>
  );
}