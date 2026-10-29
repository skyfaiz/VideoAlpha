import React from 'react';
import { motion } from 'motion/react';
import { ExternalLink, Volume2 } from 'lucide-react';

export function VoicesPage() {
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
            style={{ background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.35)' }}
          >
            <Volume2 size={11} style={{ color: '#34D399' }} />
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#A7F3D0' }}>
              Amazon Polly · Generative, Neural, Long-Form &amp; Standard TTS
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
            40+ Locales · SSML Prosody · Viseme Lip-Sync ·{' '}
            <code style={{ color: '#22D3EE' }}>WAV / MP3 / OGG / PCM</code>
          </span>
        </div>

        <a
          href="/polly-app/"
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

      {/* Embedded Amazon Polly Voice Studio */}
      <div className="flex-1 min-h-0 w-full">
        <iframe
          src="/polly-app/"
          title="Amazon Polly Voice Generation Studio"
          className="w-full h-full border-0"
          style={{ background: '#070E1D' }}
        />
      </div>
    </div>
  );
}
