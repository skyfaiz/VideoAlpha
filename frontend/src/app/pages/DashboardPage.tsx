import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  Video, Zap, Clock, CheckCircle, TrendingUp, Play,
  ArrowRight, Sparkles, Film, Users, Layers, Plus
} from 'lucide-react';

const STATS = [
  { label: 'I2V Single', value: 0, suffix: '', icon: Video, color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', trend: 'Image→Video' },
  { label: 'I2V Multi', value: 0, suffix: '', icon: Users, color: '#06B6D4', bg: 'rgba(6,182,212,0.12)', trend: 'Multi-person' },
  { label: 'V2V Single', value: 0, suffix: '', icon: Film, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', trend: 'Video→Video' },
  { label: 'V2V Multi', value: 0, suffix: '', icon: Layers, color: '#22c55e', bg: 'rgba(34,197,94,0.12)', trend: 'Multi-person' },
];

const RECENT_JOBS: { id: string; type: string; name: string; status: string; progress: number; time: string; color: string }[] = [];

const QUICK_WORKFLOWS = [
  { icon: '👤', label: 'I2V Single', sublabel: 'Image to video, 1 person', color: '#8B5CF6' },
  { icon: '👥', label: 'I2V Multi', sublabel: 'Image to video, multiple', color: '#06B6D4' },
  { icon: '🎬', label: 'V2V Single', sublabel: 'Video transform, 1 person', color: '#EC4899' },
  { icon: '🎭', label: 'V2V Multi', sublabel: 'Video transform, multiple', color: '#F59E0B' },
];

function StatCard({ stat, index }: { stat: typeof STATS[0]; index: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const step = stat.value / 40;
    let cur = 0;
    const t = setInterval(() => {
      cur = Math.min(cur + step, stat.value);
      setDisplay(cur);
      if (cur >= stat.value) clearInterval(t);
    }, 30);
    return () => clearInterval(t);
  }, [stat.value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 300, damping: 28 }}
      whileHover={{ y: -4, boxShadow: `0 12px 40px ${stat.color}25` }}
      className="rounded-2xl p-5 cursor-default"
      style={{
        background: stat.bg,
        border: `1px solid ${stat.color}25`,
        boxShadow: `0 4px 20px rgba(0,0,0,0.2)`,
        transition: 'box-shadow 0.3s ease',
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: stat.bg, border: `1px solid ${stat.color}30` }}>
          <stat.icon size={18} style={{ color: stat.color }} />
        </div>
        <span
          className="px-2 py-0.5 rounded-full"
          style={{ fontSize: '10px', fontWeight: 600, background: `${stat.color}20`, color: stat.color }}
        >
          {stat.trend}
        </span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 800, color: '#F8FAFC', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        {typeof display === 'number' && display % 1 !== 0 ? display.toFixed(1) : Math.round(display)}{stat.suffix}
      </div>
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{stat.label}</div>
    </motion.div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Hero greeting */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(6,182,212,0.1) 50%, rgba(15,23,42,0) 100%)',
          border: '1px solid rgba(139,92,246,0.2)',
        }}
      >
        {/* BG orbs */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.15), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 120, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.12), transparent)', pointerEvents: 'none' }} />

        <div className="flex items-center justify-between relative">
          <div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              style={{ fontSize: '13px', color: '#A78BFA', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}
            >
              INFINITETALK VIDEO GENERATOR
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              style={{ fontSize: '28px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em', lineHeight: 1.2 }}
            >
              Ready to generate<br />
              <span style={{ background: 'linear-gradient(90deg, #A78BFA, #22D3EE)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                stunning videos?
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: 10 }}
            >
              Create lip-sync videos with AI-powered animation
            </motion.p>
          </div>
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: 'spring' }}
            whileHover={{ scale: 1.04, boxShadow: '0 0 30px rgba(139,92,246,0.5)' }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/workflow')}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', border: 'none', cursor: 'pointer', boxShadow: '0 0 20px rgba(139,92,246,0.35)' }}
          >
            <Sparkles size={16} className="text-white" />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Start Creating</span>
            <ArrowRight size={14} className="text-white/80" />
          </motion.button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {STATS.map((s, i) => <StatCard key={s.label} stat={s} index={i} />)}
      </div>

      {/* Quick workflow selector */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#E2E8F0' }}>Quick Start</div>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>Choose a workflow type</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {QUICK_WORKFLOWS.map((wf, i) => (
            <motion.div
              key={wf.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.06, type: 'spring' }}
              whileHover={{ y: -3, borderColor: `${wf.color}60` }}
              onClick={() => navigate('/workflow')}
              className="rounded-2xl p-4 cursor-pointer group"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                transition: 'border-color 0.2s, background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
            >
              <div className="text-3xl mb-3">{wf.icon}</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#E2E8F0' }}>{wf.label}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>{wf.sublabel}</div>
              <div className="mt-3 flex items-center gap-1" style={{ color: wf.color, fontSize: '11px' }}>
                <Plus size={11} /> Start
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent jobs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#E2E8F0' }}>Recent Jobs</div>
          <motion.button
            whileHover={{ color: '#A78BFA' }}
            onClick={() => navigate('/jobs')}
            className="flex items-center gap-1"
            style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            View all <ArrowRight size={12} />
          </motion.button>
        </div>
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {RECENT_JOBS.map((job, i) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.07 }}
              className="flex items-center gap-4 px-5 py-3.5"
              style={{ borderBottom: i < RECENT_JOBS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'default' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${job.color}15`, border: `1px solid ${job.color}25` }}>
                <Film size={14} style={{ color: job.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E1' }}>{job.id}</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>·</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{job.type}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{job.name}</div>
              </div>
              {job.status === 'processing' && (
                <div className="flex items-center gap-2">
                  <div className="rounded-full overflow-hidden" style={{ width: 72, height: 3, background: 'rgba(255,255,255,0.08)' }}>
                    <motion.div
                      animate={{ width: `${job.progress}%` }}
                      style={{ height: '100%', background: 'linear-gradient(90deg, #8B5CF6, #06B6D4)', borderRadius: 99 }}
                    />
                  </div>
                  <span style={{ fontSize: '10px', color: '#A78BFA', fontVariantNumeric: 'tabular-nums' }}>{job.progress}%</span>
                </div>
              )}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: `${job.color}15`, border: `1px solid ${job.color}25` }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: job.color }} />
                  <span style={{ fontSize: '10px', fontWeight: 600, color: job.color, textTransform: 'capitalize' }}>{job.status}</span>
                </div>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>{job.time}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Performance chart teaser */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#E2E8F0' }}>Generation Volume — Last 7 Days</div>
          <div className="flex items-center gap-1" style={{ color: '#22c55e', fontSize: '12px' }}>
            <TrendingUp size={13} /> <span style={{ fontWeight: 600 }}>+18%</span>
          </div>
        </div>
        <div className="flex items-end gap-1.5" style={{ height: 60 }}>
          {[28, 42, 35, 67, 54, 80, 73].map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${(h / 80) * 100}%` }}
              transition={{ delay: 0.8 + i * 0.06, type: 'spring', stiffness: 300, damping: 25 }}
              className="flex-1 rounded-t-md"
              style={{
                background: i === 6
                  ? 'linear-gradient(to top, #8B5CF6, #06B6D4)'
                  : 'rgba(139,92,246,0.3)',
                minHeight: 4,
              }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <span key={d} style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', flex: 1, textAlign: 'center' }}>{d}</span>
          ))}
        </div>
      </motion.div>
    </div>
    </div>
  );
}