import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  Video, ArrowRight, Sparkles, Film, Clapperboard, Volume2, Users, Layers, Plus, CheckCircle, Clock, XCircle, Loader, Replace
} from 'lucide-react';
import {
  getStoredJobs,
  syncJobsWithBackend,
  formatRelativeTime,
  type StoredJob
} from '../services/api';

const QUICK_WORKFLOWS = [
  { id: 'i2v-single', icon: '👤', label: 'I2V Single', sublabel: 'Image to video, 1 person', color: '#8B5CF6' },
  { id: 'i2v-multi', icon: '👥', label: 'I2V Multi', sublabel: 'Image to video, multiple', color: '#06B6D4' },
  { id: 'v2v-single', icon: '🎬', label: 'V2V Single', sublabel: 'Video transform, 1 person', color: '#EC4899' },
  { id: 'v2v-multi', icon: '🎭', label: 'V2V Multi', sublabel: 'Video transform, multiple', color: '#F59E0B' },
];

interface StatItem {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bg: string;
  trend: string;
}

function StatCard({ stat, index }: { stat: StatItem; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 300, damping: 28 }}
      whileHover={{ y: -3, boxShadow: `0 12px 32px ${stat.color}22` }}
      className="rounded-2xl p-4 sm:p-5 cursor-default"
      style={{
        background: stat.bg,
        border: `1px solid ${stat.color}25`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center"
          style={{ background: stat.bg, border: `1px solid ${stat.color}30` }}
        >
          <stat.icon size={17} style={{ color: stat.color }} />
        </div>
        <span
          className="px-2 py-0.5 rounded-full"
          style={{ fontSize: '10px', fontWeight: 600, background: `${stat.color}20`, color: stat.color }}
        >
          {stat.trend}
        </span>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 800, color: '#F8FAFC', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        {stat.value}
      </div>
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{stat.label}</div>
    </motion.div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<StoredJob[]>(() => getStoredJobs());

  useEffect(() => {
    syncJobsWithBackend().then(setJobs);
    const onUpdate = () => setJobs(getStoredJobs());
    window.addEventListener('videoalpha-jobs-updated', onUpdate);
    return () => window.removeEventListener('videoalpha-jobs-updated', onUpdate);
  }, []);

  const stats: StatItem[] = [
    {
      label: 'I2V Single',
      value: jobs.filter(j => j.type === 'I2V Single').length,
      icon: Video,
      color: '#8B5CF6',
      bg: 'rgba(139,92,246,0.12)',
      trend: 'Image→Video',
    },
    {
      label: 'I2V Multi',
      value: jobs.filter(j => j.type === 'I2V Multi').length,
      icon: Users,
      color: '#06B6D4',
      bg: 'rgba(6,182,212,0.12)',
      trend: 'Multi-person',
    },
    {
      label: 'V2V Single',
      value: jobs.filter(j => j.type === 'V2V Single').length,
      icon: Film,
      color: '#EC4899',
      bg: 'rgba(236,72,153,0.12)',
      trend: 'Video→Video',
    },
    {
      label: 'V2V Multi',
      value: jobs.filter(j => j.type === 'V2V Multi').length,
      icon: Layers,
      color: '#F59E0B',
      bg: 'rgba(245,158,11,0.12)',
      trend: 'Multi-person',
    },
  ];

  const recentJobs = jobs.slice(0, 5);

  const statusColor = (s: StoredJob['status']) => {
    if (s === 'completed') return '#22c55e';
    if (s === 'processing') return '#8B5CF6';
    if (s === 'failed') return '#EF4444';
    return '#F59E0B';
  };

  const StatusIcon = ({ status }: { status: StoredJob['status'] }) => {
    if (status === 'completed') return <CheckCircle size={13} style={{ color: '#22c55e' }} />;
    if (status === 'processing') return <Loader size={13} className="animate-spin" style={{ color: '#8B5CF6' }} />;
    if (status === 'failed') return <XCircle size={13} style={{ color: '#EF4444' }} />;
    return <Clock size={13} style={{ color: '#F59E0B' }} />;
  };

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
    >
      <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
        {/* Hero greeting */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.16) 0%, rgba(6,182,212,0.1) 55%, rgba(15,23,42,0.2) 100%)',
            border: '1px solid rgba(139,92,246,0.22)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(139,92,246,0.15), transparent)',
              pointerEvents: 'none',
            }}
          />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative">
            <div>
              <div style={{ fontSize: '11px', color: '#A78BFA', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
                INFINITETALK SERVERLESS STUDIO
              </div>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Ready to generate{' '}
                <span
                  style={{
                    background: 'linear-gradient(90deg, #A78BFA, #22D3EE)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  talking videos?
                </span>
              </h1>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>
                Upload files, pass URLs, volume paths, or Base64 across Single & Multi-Person I2V/V2V workflows.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 flex-shrink-0 w-full sm:w-auto">
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(139,92,246,0.5)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/workflow')}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl w-full sm:w-auto"
                style={{
                  background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(139,92,246,0.35)',
                }}
              >
                <Sparkles size={15} className="text-white" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>InfiniteTalk</span>
                <ArrowRight size={14} className="text-white/80" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: '0 0 24px rgba(6,182,212,0.4)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/ltx')}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl w-full sm:w-auto"
                style={{
                  background: 'rgba(6,182,212,0.16)',
                  border: '1px solid rgba(6,182,212,0.4)',
                  cursor: 'pointer',
                }}
              >
                <Film size={15} style={{ color: '#22D3EE' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#E2E8F0' }}>LTX Generation</span>
                <ArrowRight size={14} style={{ color: '#22D3EE' }} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: '0 0 24px rgba(236,72,153,0.4)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/minimax')}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl w-full sm:w-auto"
                style={{
                  background: 'rgba(236,72,153,0.16)',
                  border: '1px solid rgba(236,72,153,0.4)',
                  cursor: 'pointer',
                }}
              >
                <Clapperboard size={15} style={{ color: '#F472B6' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#E2E8F0' }}>MiniMax H3</span>
                <ArrowRight size={14} style={{ color: '#F472B6' }} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: '0 0 24px rgba(16,185,129,0.4)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/voices')}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl w-full sm:w-auto"
                style={{
                  background: 'rgba(16,185,129,0.16)',
                  border: '1px solid rgba(16,185,129,0.4)',
                  cursor: 'pointer',
                }}
              >
                <Volume2 size={15} style={{ color: '#34D399' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#E2E8F0' }}>Generate Voices</span>
                <ArrowRight size={14} style={{ color: '#34D399' }} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: '0 0 24px rgba(245,158,11,0.4)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/characterswap')}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl w-full sm:w-auto"
                style={{
                  background: 'rgba(245,158,11,0.16)',
                  border: '1px solid rgba(245,158,11,0.4)',
                  cursor: 'pointer',
                }}
              >
                <Replace size={15} style={{ color: '#FBBF24' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#E2E8F0' }}>Character Swap</span>
                <ArrowRight size={14} style={{ color: '#FBBF24' }} />
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((s, i) => (
            <StatCard key={s.label} stat={s} index={i} />
          ))}
        </div>

        {/* Quick workflow selector */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#E2E8F0' }}>Quick Start</div>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>Select a workflow</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {QUICK_WORKFLOWS.map((wf, i) => (
              <motion.div
                key={wf.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05, type: 'spring' }}
                whileHover={{ y: -3, borderColor: `${wf.color}60` }}
                onClick={() => navigate(`/workflow?type=${wf.id}`)}
                className="rounded-2xl p-4 cursor-pointer group"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
              >
                <div className="text-2xl sm:text-3xl mb-2.5">{wf.icon}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#E2E8F0' }}>{wf.label}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{wf.sublabel}</div>
                <div className="mt-3 flex items-center gap-1" style={{ color: wf.color, fontSize: '11px', fontWeight: 600 }}>
                  <Plus size={11} /> Launch
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Recent jobs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#E2E8F0' }}>Recent Submitted Jobs</div>
            <motion.button
              whileHover={{ color: '#A78BFA' }}
              onClick={() => navigate('/jobs')}
              className="flex items-center gap-1"
              style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              View all <ArrowRight size={12} />
            </motion.button>
          </div>

          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {recentJobs.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>
                  No jobs submitted yet
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                  Start a workflow above to generate your first video.
                </div>
              </div>
            ) : (
              recentJobs.map((job, i) => {
                const color = statusColor(job.status);
                return (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    onClick={() => navigate('/jobs')}
                    className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5"
                    style={{
                      borderBottom: i < recentJobs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}15`, border: `1px solid ${color}25` }}
                    >
                      <StatusIcon status={job.status} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E1', fontFamily: 'monospace' }}>
                          #{job.id.slice(0, 8)}
                        </span>
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>·</span>
                        <span style={{ fontSize: '11px', color: '#C4B5FD', fontWeight: 600 }}>{job.type}</span>
                      </div>
                      <div className="truncate" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                        {job.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div
                        className="px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: `${color}15`, border: `1px solid ${color}25` }}
                      >
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                        <span style={{ fontSize: '10px', fontWeight: 600, color, textTransform: 'capitalize' }}>
                          {job.status}
                        </span>
                      </div>
                      <span className="hidden sm:inline" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)' }}>
                        {formatRelativeTime(job.createdAt)}
                      </span>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
