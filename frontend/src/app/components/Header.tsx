import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Plus, Zap, CheckCircle, Clock, XCircle, Video, Settings } from 'lucide-react';
import { getStoredJobs, syncJobsWithBackend, formatRelativeTime, type StoredJob } from '../services/api';

const PAGE_TITLES: Record<string, { label: string; sub: string }> = {
  '/': { label: 'Dashboard', sub: 'Overview & recent activity' },
  '/workflow': { label: 'Create', sub: 'Start a new video generation' },
  '/ltx': { label: 'LTX Generation', sub: 'LTX 2.5 Distilled INT8 Serverless Studio' },
  '/jobs': { label: 'Jobs', sub: 'Track your generation queue' },
  '/architecture': { label: 'Architecture', sub: 'System flow diagram' },
};

interface HeaderProps {
  onSettingsOpen?: () => void;
}

export function Header({ onSettingsOpen }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifs, setShowNotifs] = useState(false);
  const [jobs, setJobs] = useState<StoredJob[]>(() => getStoredJobs());

  useEffect(() => {
    syncJobsWithBackend().then(setJobs);
    const handler = () => setJobs(getStoredJobs());
    window.addEventListener('videoalpha-jobs-updated', handler);
    return () => window.removeEventListener('videoalpha-jobs-updated', handler);
  }, []);

  const page = PAGE_TITLES[location.pathname] ?? { label: 'VideoAlpha', sub: '' };
  const recentNotifications = jobs.slice(0, 5);
  const activeCount = jobs.filter(j => j.status === 'processing' || j.status === 'queued').length;

  return (
    <header
      className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6"
      style={{
        height: 60,
        background: 'rgba(15,23,42,0.88)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        zIndex: 30,
        position: 'relative',
      }}
    >
      {/* Left: Mobile brand + Title */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          onClick={() => navigate('/')}
          className="md:hidden flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            boxShadow: '0 0 16px rgba(139,92,246,0.45)',
          }}
        >
          <Video size={15} className="text-white" />
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            className="min-w-0"
          >
            <div className="truncate" style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.01em' }}>
              {page.label}
            </div>
            {page.sub && (
              <div className="hidden sm:block truncate" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                {page.sub}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Create button */}
        <motion.button
          onClick={() => navigate('/workflow')}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            boxShadow: '0 0 16px rgba(139,92,246,0.35)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus size={14} className="text-white" />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>New Video</span>
        </motion.button>

        {/* Notification bell */}
        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNotifs(s => !s)}
            className="relative w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
          >
            <Bell size={15} style={{ color: 'rgba(255,255,255,0.6)' }} />
            {activeCount > 0 && (
              <motion.div
                animate={{ scale: [1, 1.25, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: '#8B5CF6', fontSize: '9px', fontWeight: 700, color: '#fff' }}
              >
                {activeCount}
              </motion.div>
            )}
          </motion.button>

          <AnimatePresence>
            {showNotifs && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="absolute right-0 top-12 w-72 max-w-[calc(100vw-24px)] rounded-2xl overflow-hidden"
                style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', zIndex: 50 }}
              >
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC' }}>Recent Activity</span>
                  {jobs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setShowNotifs(false); navigate('/jobs'); }}
                      style={{ fontSize: '11px', color: '#A78BFA', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      View all
                    </button>
                  )}
                </div>
                {recentNotifications.length === 0 ? (
                  <div className="px-4 py-6 text-center" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                    No jobs submitted yet
                  </div>
                ) : (
                  recentNotifications.map((j, i) => {
                    const iconMap = {
                      completed: { Icon: CheckCircle, color: '#22c55e', label: 'completed' },
                      processing: { Icon: Zap, color: '#8B5CF6', label: 'processing' },
                      queued: { Icon: Clock, color: '#F59E0B', label: 'queued' },
                      failed: { Icon: XCircle, color: '#EF4444', label: 'failed' },
                    };
                    const meta = iconMap[j.status];
                    return (
                      <motion.div
                        key={j.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => { setShowNotifs(false); navigate('/jobs'); }}
                        className="flex items-start gap-3 px-4 py-3"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                      >
                        <meta.Icon size={14} style={{ color: meta.color, flexShrink: 0, marginTop: 2 }} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate" style={{ fontSize: '12px', color: '#E2E8F0' }}>
                            {j.type} · {j.name} ({meta.label})
                          </div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                            {formatRelativeTime(j.createdAt)}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Settings shortcut on desktop */}
        {onSettingsOpen && (
          <motion.button
            onClick={onSettingsOpen}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="hidden sm:flex w-9 h-9 rounded-xl items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
            title="Settings"
          >
            <Settings size={15} style={{ color: 'rgba(255,255,255,0.55)' }} />
          </motion.button>
        )}
      </div>

      {/* Click-away overlay */}
      {showNotifs && (
        <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />
      )}
    </header>
  );
}
