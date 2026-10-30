import React from 'react';
import { motion } from 'motion/react';
import { Clapperboard, Ban } from 'lucide-react';

export function MinimaxPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Top strip */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <div
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full"
            style={{ background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.3)' }}
          >
            <Ban size={11} style={{ color: '#94A3B8' }} />
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#CBD5E1' }}>MiniMax H3 · Disabled</span>
          </div>
        </div>
      </motion.div>

      {/* Disabled notice */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center rounded-2xl p-8 max-w-sm"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.25)' }}
          >
            <Clapperboard size={20} style={{ color: 'rgba(255,255,255,0.35)' }} />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#E2E8F0' }}>MiniMax H3 Studio</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: 6, lineHeight: 1.6 }}>
            This service is currently disabled. The MiniMax backend route has been unmounted from this deployment.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
