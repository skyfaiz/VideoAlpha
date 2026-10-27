import React from 'react';
import { motion } from 'motion/react';
import FlowDashboard from '../components/FlowDashboard';

export function ArchitecturePage() {
  return (
    <div className="flex flex-col h-full">
      {/* Page intro strip */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 sm:py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
            Interactive pipeline diagram · Tap nodes to inspect
          </div>
          <div
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#86efac' }}>Online</span>
          </div>
        </div>
        <div className="hidden sm:block" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
          RunPod Serverless · ComfyUI · S3 Volume
        </div>
      </motion.div>

      {/* Flow diagram fills remaining height */}
      <div className="flex-1 min-h-0 overflow-x-auto">
        <FlowDashboard />
      </div>
    </div>
  );
}
