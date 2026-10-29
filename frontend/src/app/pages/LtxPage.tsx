import React from 'react';
import { motion } from 'motion/react';
import { ExternalLink, Sparkles } from 'lucide-react';

export function LtxPage() {
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
            style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.35)' }}
          >
            <Sparkles size={11} style={{ color: '#F87171' }} />
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#FCA5A5' }}>LTX 2.5 · Out of Service</span>
          </div>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
            Models Volume: <code style={{ color: '#22D3EE' }}>videoalpha-models (global)</code>
          </span>
        </div>

        <a
          href="/ltx-app/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: '11px',
            color: '#E2E8F0',
            textDecoration: 'none',
          }}
        >
          <span>Open Standalone</span>
          <ExternalLink size={11} />
        </a>
      </motion.div>

      {/* Embedded LTX 2.5 Serverless Frontend */}
      <div className="flex-1 min-h-0 w-full">
        <iframe
          src="/ltx-app/"
          title="LTX 2.5 Serverless Generation"
          className="w-full h-full border-0"
          style={{ background: '#0B1020' }}
        />
      </div>
    </div>
  );
}
