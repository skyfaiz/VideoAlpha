import React from 'react';
import { NavLink, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, Sparkles, Briefcase, GitBranch,
  Settings, ChevronLeft, Video, Film, Clapperboard
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/workflow', icon: Sparkles, label: 'Create' },
  { to: '/ltx', icon: Film, label: 'LTX Generation' },
  { to: '/minimax', icon: Clapperboard, label: 'MiniMax H3' },
  { to: '/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/architecture', icon: GitBranch, label: 'Architecture' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onSettingsOpen: () => void;
}

export function Sidebar({ collapsed, onToggle, onSettingsOpen }: SidebarProps) {
  const location = useLocation();

  const isActive = (to: string, exact = false) => {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ type: 'spring', stiffness: 350, damping: 35 }}
      className="hidden md:flex flex-shrink-0 flex-col relative z-20"
      style={{
        background: 'rgba(15,23,42,0.95)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', minHeight: 68 }}
      >
        <motion.div
          className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            boxShadow: '0 0 20px rgba(139,92,246,0.5)',
          }}
          animate={{
            boxShadow: [
              '0 0 20px rgba(139,92,246,0.5)',
              '0 0 30px rgba(6,182,212,0.6)',
              '0 0 20px rgba(139,92,246,0.5)',
            ],
          }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        >
          <Video size={15} className="text-white" />
        </motion.div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 800,
                  background: 'linear-gradient(90deg, #A78BFA, #22D3EE)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '-0.02em',
                }}
              >
                VideoAlpha
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginTop: -1 }}>
                AI VIDEO GEN
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label, exact }) => {
          const active = isActive(to, exact);
          return (
            <NavLink key={to} to={to}>
              <motion.div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer relative group"
                whileHover={{ x: collapsed ? 0 : 3 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                style={{
                  background: active ? 'rgba(139,92,246,0.2)' : 'transparent',
                  border: active ? '1px solid rgba(139,92,246,0.35)' : '1px solid transparent',
                  minHeight: 42,
                }}
              >
                {active && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 rounded-xl"
                    style={{ background: 'rgba(139,92,246,0.12)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}
                <div
                  className="relative flex-shrink-0 flex items-center justify-center"
                  style={{ width: 20, color: active ? '#A78BFA' : 'rgba(255,255,255,0.4)' }}
                >
                  <Icon size={17} />
                  {active && (
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{ background: '#8B5CF6', filter: 'blur(8px)', opacity: 0.4 }}
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    />
                  )}
                </div>
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        fontSize: '13px',
                        fontWeight: active ? 600 : 400,
                        color: active ? '#C4B5FD' : 'rgba(255,255,255,0.5)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-4 space-y-1 flex-shrink-0">
        {/* Settings */}
        <motion.button
          onClick={onSettingsOpen}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer"
          whileHover={{ x: collapsed ? 0 : 3 }}
          style={{ background: 'transparent', border: '1px solid transparent', minHeight: 42 }}
        >
          <Settings size={17} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0, marginLeft: 1.5 }} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}
              >
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Collapse toggle */}
        <motion.button
          onClick={onToggle}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl"
          whileHover={{ background: 'rgba(255,255,255,0.04)' }}
          style={{
            border: '1px solid rgba(255,255,255,0.06)',
            minHeight: 42,
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0, display: 'flex' }}
          >
            <ChevronLeft size={15} />
          </motion.div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.aside>
  );
}

export function MobileBottomNav({ onSettingsOpen }: { onSettingsOpen: () => void }) {
  const location = useLocation();

  const isActive = (to: string, exact = false) => {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  return (
    <nav
      className="md:hidden flex-shrink-0 flex items-center justify-around px-2 py-1.5 z-30"
      style={{
        background: 'rgba(10,16,32,0.96)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {NAV_ITEMS.map(({ to, icon: Icon, label, exact }) => {
        const active = isActive(to, exact);
        return (
          <NavLink key={to} to={to} className="flex-1">
            <div
              className="flex flex-col items-center justify-center py-1.5 rounded-xl transition-colors"
              style={{
                background: active ? 'rgba(139,92,246,0.16)' : 'transparent',
                color: active ? '#C4B5FD' : 'rgba(255,255,255,0.45)',
              }}
            >
              <Icon size={18} style={{ color: active ? '#A78BFA' : 'rgba(255,255,255,0.45)' }} />
              <span style={{ fontSize: '10px', fontWeight: active ? 600 : 400, marginTop: 2 }}>
                {label === 'Architecture' ? 'Flow' : label === 'LTX Generation' ? 'LTX 2.5' : label === 'MiniMax H3' ? 'MiniMax' : label}
              </span>
            </div>
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={onSettingsOpen}
        className="flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl"
        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.45)' }}
      >
        <Settings size={18} style={{ color: 'rgba(255,255,255,0.45)' }} />
        <span style={{ fontSize: '10px', marginTop: 2 }}>Settings</span>
      </button>
    </nav>
  );
}
