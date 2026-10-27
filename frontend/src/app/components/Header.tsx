import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Search, Plus, User, ChevronDown, Zap, CheckCircle, Clock } from 'lucide-react';

const PAGE_TITLES: Record<string, { label: string; sub: string }> = {
  '/': { label: 'Dashboard', sub: 'Overview & recent activity' },
  '/workflow': { label: 'Create', sub: 'Start a new video generation' },
  '/jobs': { label: 'Jobs', sub: 'Track your generation queue' },
  '/architecture': { label: 'Architecture', sub: 'System flow diagram' },
};

const NOTIFICATIONS = [
  { id: 1, icon: CheckCircle, color: '#22c55e', msg: 'Job #042 completed', time: '2m ago' },
  { id: 2, icon: Zap, color: '#8B5CF6', msg: 'Job #043 started processing', time: '5m ago' },
  { id: 3, icon: Clock, color: '#F59E0B', msg: 'Job #041 queued', time: '12m ago' },
];

interface HeaderProps {
  onCreateClick: () => void;
}

export function Header({ onCreateClick }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [unread] = useState(2);

  const page = PAGE_TITLES[location.pathname] ?? { label: 'VideoAlpha', sub: '' };

  return (
    <header
      className="flex-shrink-0 flex items-center justify-between px-6"
      style={{
        height: 64,
        background: 'rgba(15,23,42,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        zIndex: 30,
        position: 'relative',
      }}
    >
      {/* Left: Title */}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25 }}
        >
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.01em' }}>
            {page.label}
          </div>
          {page.sub && (
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{page.sub}</div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Create button */}
        <motion.button
          onClick={() => navigate('/workflow')}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            boxShadow: '0 0 16px rgba(139,92,246,0.4)',
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
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { setShowNotifs(s => !s); setShowUser(false); }}
            className="relative w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
          >
            <Bell size={15} style={{ color: 'rgba(255,255,255,0.6)' }} />
            {unread > 0 && (
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: '#8B5CF6', fontSize: '9px', fontWeight: 700, color: '#fff' }}
              >
                {unread}
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
                className="absolute right-0 top-12 w-72 rounded-2xl overflow-hidden"
                style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', zIndex: 50 }}
              >
                <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC' }}>Notifications</span>
                </div>
                {NOTIFICATIONS.map((n, i) => (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-3 px-4 py-3"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                  >
                    <n.icon size={14} style={{ color: n.color, flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: '12px', color: '#E2E8F0' }}>{n.msg}</div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{n.time}</div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User menu */}
        <div className="relative">
          <motion.button
            onClick={() => { setShowUser(s => !s); setShowNotifs(false); }}
            whileHover={{ scale: 1.02 }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #EC4899)' }}>
              <User size={12} className="text-white" />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>User</span>
            <ChevronDown size={12} style={{ color: 'rgba(255,255,255,0.3)' }} />
          </motion.button>

          <AnimatePresence>
            {showUser && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                className="absolute right-0 top-12 w-48 rounded-2xl overflow-hidden"
                style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', zIndex: 50 }}
              >
                {['Settings', 'About'].map(item => (
                  <div key={item} className="px-4 py-2.5 cursor-pointer"
                    style={{ fontSize: '12px', color: item === 'Sign Out' ? '#F87171' : '#CBD5E1', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {item}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Click-away overlay */}
      {(showNotifs || showUser) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowNotifs(false); setShowUser(false); }} />
      )}
    </header>
  );
}
