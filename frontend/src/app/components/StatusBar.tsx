import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cpu, HardDrive, Activity, CheckCircle, Loader, AlertCircle } from 'lucide-react';

interface ActiveJob {
  id: string;
  name: string;
  progress: number;
  stage: string;
  color: string;
}

const STAGES = ['Initializing', 'Loading model', 'Processing frames', 'Compositing', 'Encoding output'];

export function StatusBar() {
  const [activeJob, setActiveJob] = useState<ActiveJob | null>({
    id: 'job-043',
    name: 'I2V Single · beach_sunset.jpg',
    progress: 34,
    stage: STAGES[1],
    color: '#8B5CF6',
  });
  const [gpu, setGpu] = useState(72);
  const [vram, setVram] = useState(58);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveJob(j => {
        if (!j) return j;
        const next = Math.min(j.progress + (Math.random() * 2.5), 100);
        const stageIdx = Math.floor((next / 100) * (STAGES.length - 1));
        if (next >= 100) return null;
        return { ...j, progress: next, stage: STAGES[stageIdx] };
      });
      setGpu(Math.floor(65 + Math.random() * 25));
      setVram(Math.floor(50 + Math.random() * 35));
      setTick(t => t + 1);
    }, 900);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-6"
      style={{
        height: 44,
        background: 'rgba(10,16,32,0.95)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        zIndex: 30,
      }}
    >
      {/* Left: Job status */}
      <div className="flex items-center gap-4">
        <AnimatePresence mode="wait">
          {activeJob ? (
            <motion.div
              key="active"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-2.5"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
              >
                <Loader size={11} style={{ color: activeJob.color }} />
              </motion.div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                <span style={{ color: '#C4B5FD', fontWeight: 600 }}>{activeJob.id}</span>
                {' · '}{activeJob.name}
              </span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
                {activeJob.stage}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2"
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>All jobs complete</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress bar */}
        {activeJob && (
          <div className="flex items-center gap-2">
            <div
              className="rounded-full overflow-hidden"
              style={{ width: 120, height: 3, background: 'rgba(255,255,255,0.08)' }}
            >
              <motion.div
                animate={{ width: `${activeJob.progress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{
                  height: '100%',
                  background: `linear-gradient(90deg, #8B5CF6, #06B6D4)`,
                  borderRadius: '99px',
                  boxShadow: '0 0 8px rgba(139,92,246,0.6)',
                }}
              />
            </div>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(activeJob.progress)}%
            </span>
          </div>
        )}
      </div>

      {/* Right: System stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Cpu size={11} style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>GPU</span>
          <div className="rounded-full overflow-hidden" style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              animate={{ width: `${gpu}%` }}
              transition={{ duration: 0.6 }}
              style={{ height: '100%', background: gpu > 85 ? '#EF4444' : '#06B6D4', borderRadius: '99px' }}
            />
          </div>
          <span style={{ fontSize: '10px', color: '#22D3EE', fontVariantNumeric: 'tabular-nums' }}>{gpu}%</span>
        </div>

        <div className="flex items-center gap-1.5">
          <HardDrive size={11} style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>VRAM</span>
          <div className="rounded-full overflow-hidden" style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              animate={{ width: `${vram}%` }}
              transition={{ duration: 0.6 }}
              style={{ height: '100%', background: vram > 85 ? '#EF4444' : '#8B5CF6', borderRadius: '99px' }}
            />
          </div>
          <span style={{ fontSize: '10px', color: '#A78BFA', fontVariantNumeric: 'tabular-nums' }}>{vram}%</span>
        </div>

        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />
        <div className="flex items-center gap-1.5">
          <Activity size={11} style={{ color: '#22c55e' }} />
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>RunPod · H100 SXM · Online</span>
        </div>
      </div>
    </div>
  );
}
