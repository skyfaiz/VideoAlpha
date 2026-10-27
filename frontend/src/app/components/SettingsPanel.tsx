import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Moon, Bell, Zap, Shield, HardDrive, RefreshCw, ChevronRight } from 'lucide-react';

interface SettingToggleProps {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}

function SettingToggle({ label, sublabel, value, onChange, color = '#8B5CF6' }: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between py-3"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div style={{ fontSize: '13px', color: '#E2E8F0', fontWeight: 500 }}>{label}</div>
        {sublabel && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{sublabel}</div>}
      </div>
      <motion.button
        onClick={() => onChange(!value)}
        className="relative rounded-full flex-shrink-0"
        style={{ width: 40, height: 22, background: value ? color : 'rgba(255,255,255,0.12)', cursor: 'pointer', border: 'none' }}
        whileTap={{ scale: 0.95 }}
      >
        <motion.div
          animate={{ x: value ? 20 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-1 rounded-full"
          style={{ width: 14, height: 14, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
        />
        {value && (
          <motion.div
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="absolute inset-0 rounded-full"
            style={{ background: color, filter: 'blur(4px)', opacity: 0.3 }}
          />
        )}
      </motion.button>
    </div>
  );
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState({
    notifications: true,
    autoDownload: false,
    gpuOptimize: true,
    darkMode: true,
    telemetry: false,
    autoRetry: true,
  });

  const [quality, setQuality] = useState('1080p');
  const [region, setRegion] = useState('us-east-1');

  const toggle = (key: keyof typeof settings) =>
    setSettings(s => ({ ...s, [key]: !s[key] }));

  const sections = [
    {
      title: 'Preferences',
      icon: Moon,
      items: [
        { key: 'darkMode', label: 'Dark Mode', sublabel: 'Always use dark interface', color: '#8B5CF6' },
        { key: 'notifications', label: 'Notifications', sublabel: 'Job status alerts', color: '#06B6D4' },
        { key: 'autoDownload', label: 'Auto-download', sublabel: 'Download when complete', color: '#22c55e' },
      ],
    },
    {
      title: 'Performance',
      icon: Zap,
      items: [
        { key: 'gpuOptimize', label: 'GPU Optimization', sublabel: 'Maximize throughput', color: '#F59E0B' },
        { key: 'autoRetry', label: 'Auto-retry', sublabel: 'Retry failed jobs', color: '#8B5CF6' },
        { key: 'telemetry', label: 'Usage analytics', sublabel: 'Help improve the product', color: '#06B6D4' },
      ],
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: 360,
              background: 'rgba(15,23,42,0.98)',
              backdropFilter: 'blur(24px)',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#F8FAFC' }}>Settings</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Configure your workspace</div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
              >
                <X size={14} style={{ color: 'rgba(255,255,255,0.6)' }} />
              </motion.button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>

              {sections.map((section, si) => (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: si * 0.08 }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <section.icon size={13} style={{ color: '#8B5CF6' }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>
                      {section.title.toUpperCase()}
                    </span>
                  </div>
                  <div className="rounded-2xl px-4 py-1"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {section.items.map(item => (
                      <SettingToggle
                        key={item.key}
                        label={item.label}
                        sublabel={item.sublabel}
                        value={settings[item.key as keyof typeof settings]}
                        onChange={() => toggle(item.key as keyof typeof settings)}
                        color={item.color}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}

              {/* Output Quality */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive size={13} style={{ color: '#8B5CF6' }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>
                    OUTPUT
                  </span>
                </div>
                <div className="rounded-2xl p-4 space-y-4"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Default Resolution</div>
                    <div className="flex gap-2">
                      {['720p', '1080p', '4K'].map(q => (
                        <button key={q} onClick={() => setQuality(q)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 8,
                            fontSize: '11px',
                            fontWeight: 600,
                            background: quality === q ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${quality === q ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                            color: quality === q ? '#C4B5FD' : 'rgba(255,255,255,0.4)',
                            cursor: 'pointer',
                          }}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>GPU Region</div>
                    <div className="flex gap-2 flex-wrap">
                      {['us-east-1', 'eu-west-1', 'ap-south-1'].map(r => (
                        <button key={r} onClick={() => setRegion(r)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 8,
                            fontSize: '11px',
                            background: region === r ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${region === r ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.08)'}`,
                            color: region === r ? '#22D3EE' : 'rgba(255,255,255,0.4)',
                            cursor: 'pointer',
                          }}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex-shrink-0"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <motion.button
                whileHover={{ scale: 1.02, boxShadow: '0 0 24px rgba(139,92,246,0.5)' }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #0E7490)', cursor: 'pointer', border: 'none' }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Save Settings</span>
              </motion.button>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 10 }}>
                VideoAlpha v2.4.1 · RunPod Serverless
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
