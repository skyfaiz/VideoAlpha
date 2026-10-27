import React from 'react';
import { motion } from 'motion/react';
import { X, Cpu, Zap, Activity, Link2 } from 'lucide-react';

export interface NodeData {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  xPercent: number;
  gradient: string;
  borderColor: string;
  glowColor: string;
  particleColors: string[];
  description: string;
  details: string[];
  metrics: Record<string, string>;
  connections: string[];
}

interface InfoPanelProps {
  node: NodeData;
  onClose: () => void;
}

export function InfoPanel({ node, onClose }: InfoPanelProps) {
  const metricEntries = Object.entries(node.metrics);

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      className="absolute top-0 right-0 h-full w-80 z-30 flex flex-col"
      style={{
        background: 'rgba(10, 8, 30, 0.92)',
        backdropFilter: 'blur(24px)',
        borderLeft: `1px solid ${node.glowColor}30`,
        boxShadow: `-20px 0 60px rgba(0,0,0,0.5), inset 1px 0 0 ${node.glowColor}20`,
      }}
    >
      {/* Header */}
      <div
        className="relative p-5 pb-4"
        style={{
          borderBottom: `1px solid ${node.glowColor}20`,
          background: `linear-gradient(135deg, ${node.glowColor}15 0%, transparent 100%)`,
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <X size={13} className="text-white/70" />
        </button>

        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${node.glowColor}30, ${node.glowColor}10)`,
              border: `1px solid ${node.glowColor}40`,
              boxShadow: `0 0 20px ${node.glowColor}30`,
            }}
          >
            {node.icon}
          </div>
          <div>
            <div className="text-white text-sm font-semibold leading-tight">{node.label}</div>
            <div className="text-xs mt-0.5" style={{ color: node.glowColor + 'BB' }}>
              {node.sublabel}
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div className="mt-3 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: node.glowColor }} />
          <span className="text-xs" style={{ color: node.glowColor + 'DD' }}>
            Active · Online
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ scrollbarWidth: 'thin', scrollbarColor: `${node.glowColor}40 transparent` }}>

        {/* Description */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Activity size={12} style={{ color: node.glowColor }} />
            <span className="text-xs uppercase tracking-widest text-white/40">Overview</span>
          </div>
          <p className="text-xs leading-relaxed text-white/60">{node.description}</p>
        </div>

        {/* Features */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Cpu size={12} style={{ color: node.glowColor }} />
            <span className="text-xs uppercase tracking-widest text-white/40">Features</span>
          </div>
          <div className="space-y-1.5">
            {node.details.map((detail, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="w-1 h-1 rounded-full flex-shrink-0"
                  style={{ background: node.glowColor }}
                />
                <span className="text-xs text-white/70">{detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Metrics grid */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Zap size={12} style={{ color: node.glowColor }} />
            <span className="text-xs uppercase tracking-widest text-white/40">Metrics</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {metricEntries.map(([key, value]) => (
              <div
                key={key}
                className="rounded-xl p-2.5"
                style={{
                  background: `${node.glowColor}10`,
                  border: `1px solid ${node.glowColor}20`,
                }}
              >
                <div className="text-xs text-white/40 mb-0.5">{key}</div>
                <div className="text-xs text-white/90 font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Connections */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Link2 size={12} style={{ color: node.glowColor }} />
            <span className="text-xs uppercase tracking-widest text-white/40">Connections</span>
          </div>
          <div className="space-y-1.5">
            {node.connections.map((conn, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/60"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="text-white/30">↔</span>
                {conn}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer gradient line */}
      <div
        className="h-px w-full"
        style={{ background: `linear-gradient(90deg, transparent, ${node.glowColor}60, transparent)` }}
      />
    </motion.div>
  );
}
