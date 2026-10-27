import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Play, Pause, RotateCcw, Zap, Server, Database, Video, Activity, ChevronRight } from 'lucide-react';
import { InfoPanel, type NodeData } from './InfoPanel';

// ─── Node Definitions ─────────────────────────────────────────────────────────
const NODES: NodeData[] = [
  {
    id: 'client',
    label: 'Client',
    sublabel: 'User Interface',
    icon: '👤',
    xPercent: 9,
    gradient: 'from-violet-600 to-purple-900',
    borderColor: 'border-violet-500/40',
    glowColor: '#8B5CF6',
    particleColors: ['#8B5CF6', '#A78BFA', '#C4B5FD'],
    description:
      'The client interface initiates video generation requests via REST API calls. It manages authentication, request queuing, and delivers generated content to end users in real time.',
    details: ['REST API integration', 'WebSocket status updates', 'OAuth 2.0 authentication', 'Request rate limiting'],
    metrics: { 'Requests/hr': '1.2K', 'Avg Latency': '< 100ms', Uptime: '99.9%', 'Active Users': '248' },
    connections: ['Docker Image'],
  },
  {
    id: 'docker',
    label: 'Docker Image',
    sublabel: 'Container Environment',
    icon: '🐳',
    xPercent: 28,
    gradient: 'from-blue-600 to-blue-900',
    borderColor: 'border-blue-500/40',
    glowColor: '#3B82F6',
    particleColors: ['#3B82F6', '#60A5FA', '#93C5FD'],
    description:
      'Containerized environment with all dependencies pre-installed. Includes CUDA drivers, Python runtime, ComfyUI, and model weights for fully reproducible, zero-config deployments.',
    details: ['CUDA 12.1 + cuDNN', 'Python 3.11 runtime', 'ComfyUI pre-installed', 'Model weights cached'],
    metrics: { 'Image Size': '8.2 GB', Layers: '23', 'Build Time': '4.2 min', 'CUDA Version': '12.1' },
    connections: ['Client', 'RunPod Serverless'],
  },
  {
    id: 'runpod',
    label: 'RunPod Serverless',
    sublabel: 'Cloud GPU Infrastructure',
    icon: '⚡',
    xPercent: 50,
    gradient: 'from-cyan-500 to-teal-900',
    borderColor: 'border-cyan-400/40',
    glowColor: '#06B6D4',
    particleColors: ['#06B6D4', '#22D3EE', '#67E8F9'],
    description:
      'Serverless GPU infrastructure that auto-scales from zero to thousands of workers based on queue depth. Provisions H100/A100 GPUs on demand and terminates idle workers within seconds.',
    details: ['Auto-scaling 0 to ∞', 'H100/A100 GPU fleet', 'Pay-per-second billing', 'Global edge deployment'],
    metrics: { 'GPU Type': 'H100 SXM', 'Cold Start': '~8s', 'Scale Speed': '< 30s', 'Cost/hr': '$2.49' },
    connections: ['Docker Image', 'ComfyUI Instance'],
  },
  {
    id: 'comfyui',
    label: 'ComfyUI Instance',
    sublabel: 'AI Workflow Engine',
    icon: '🎨',
    xPercent: 72,
    gradient: 'from-pink-600 to-rose-900',
    borderColor: 'border-pink-500/40',
    glowColor: '#EC4899',
    particleColors: ['#EC4899', '#F472B6', '#F9A8D4'],
    description:
      'Node-based AI workflow engine orchestrating the full video generation pipeline. Manages model inference, ControlNet, temporal consistency, and multi-step upscaling workflows.',
    details: ['AnimateDiff workflows', 'ControlNet support', 'SDXL + LoRA models', 'Temporal consistency'],
    metrics: { 'Models Loaded': '12', 'Workflows': '8', 'Avg Gen Time': '42s', 'VRAM Used': '78 GB' },
    connections: ['RunPod Serverless', 'S3 Storage'],
  },
  {
    id: 's3',
    label: 'S3 Storage',
    sublabel: 'Cloud Object Storage',
    icon: '💾',
    xPercent: 91,
    gradient: 'from-amber-500 to-orange-900',
    borderColor: 'border-amber-400/40',
    glowColor: '#F59E0B',
    particleColors: ['#F59E0B', '#FCD34D', '#FDE68A'],
    description:
      'Scalable cloud object storage for generated videos, model checkpoints, and workflow artifacts. Integrated with CloudFront CDN for fast, global content delivery at low latency.',
    details: ['CloudFront CDN', 'Lifecycle management', 'Server-side encryption', 'Cross-region replication'],
    metrics: { 'Storage Used': '2.4 TB', Objects: '1.2M', 'CDN BW/day': '450 GB', Availability: '99.99%' },
    connections: ['ComfyUI Instance'],
  },
];

// ─── Connection Definitions ────────────────────────────────────────────────────
const CONNECTIONS = [
  { from: 0, to: 1, label: 'API Request', forwardColors: ['#8B5CF6', '#60A5FA'], backwardColors: ['#F59E0B', '#A78BFA'] },
  { from: 1, to: 2, label: 'Container Pull', forwardColors: ['#3B82F6', '#22D3EE'], backwardColors: ['#FCD34D', '#60A5FA'] },
  { from: 2, to: 3, label: 'GPU Execute', forwardColors: ['#06B6D4', '#F472B6'], backwardColors: ['#EC4899', '#67E8F9'] },
  { from: 3, to: 4, label: 'Upload Output', forwardColors: ['#EC4899', '#FCD34D'], backwardColors: ['#F59E0B', '#C4B5FD'] },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Particle {
  id: number;
  connIdx: number;
  t: number;
  speed: number;
  colors: string[];
  size: number;
  alpha: number;
  direction: 'forward' | 'backward';
  history: { x: number; y: number }[];
}

interface Stats {
  requests: number;
  videos: number;
  workers: number;
  mbProcessed: number;
}

// ─── Bezier Math ──────────────────────────────────────────────────────────────
function cubicBezierVal(t: number, p0: number, p1: number, p2: number, p3: number) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function getPath(connIdx: number, direction: 'forward' | 'backward', w: number, h: number) {
  const conn = CONNECTIONS[connIdx];
  const srcNode = direction === 'forward' ? NODES[conn.from] : NODES[conn.to];
  const dstNode = direction === 'forward' ? NODES[conn.to] : NODES[conn.from];

  const srcX = (srcNode.xPercent / 100) * w;
  const dstX = (dstNode.xPercent / 100) * w;
  const midY = h * 0.5;
  const yOffset = direction === 'forward' ? -h * 0.13 : h * 0.13;

  return {
    srcX, srcY: midY,
    cp1x: srcX + (dstX - srcX) * 0.35, cp1y: midY + yOffset,
    cp2x: srcX + (dstX - srcX) * 0.65, cp2y: midY + yOffset,
    dstX, dstY: midY,
  };
}

function getPointOnPath(t: number, path: ReturnType<typeof getPath>) {
  return {
    x: cubicBezierVal(t, path.srcX, path.cp1x, path.cp2x, path.dstX),
    y: cubicBezierVal(t, path.srcY, path.cp1y, path.cp2y, path.dstY),
  };
}

// ─── Particle Counter ─────────────────────────────────────────────────────────
let particleId = 0;

function makeParticle(connIdx: number, direction: 'forward' | 'backward'): Particle {
  const conn = CONNECTIONS[connIdx];
  const colors = direction === 'forward' ? conn.forwardColors : conn.backwardColors;
  return {
    id: particleId++,
    connIdx,
    t: 0,
    speed: 0.0022 + Math.random() * 0.0018,
    colors,
    size: direction === 'forward' ? 3.5 + Math.random() * 2.5 : 2.5 + Math.random() * 2,
    alpha: direction === 'forward' ? 0.85 + Math.random() * 0.15 : 0.6 + Math.random() * 0.3,
    direction,
    history: [],
  };
}

// ─── NodeCard Component ───────────────────────────────────────────────────────
interface NodeCardProps {
  node: NodeData;
  isPlaying: boolean;
  isSelected: boolean;
  onClick: () => void;
}

function NodeCard({ node, isPlaying, isSelected, onClick }: NodeCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="absolute cursor-pointer"
      style={{
        left: `calc(${node.xPercent}% - 76px)`,
        top: '50%',
        transform: 'translateY(-50%)',
        width: '152px',
        zIndex: 10,
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div
        animate={{
          scale: hovered ? 1.06 : 1,
          y: hovered ? -6 : 0,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        style={{
          background: isSelected
            ? `linear-gradient(135deg, ${node.glowColor}25, ${node.glowColor}10)`
            : 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${isSelected || hovered ? node.glowColor + '70' : node.glowColor + '30'}`,
          borderRadius: '18px',
          boxShadow: hovered || isSelected
            ? `0 0 30px ${node.glowColor}40, 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)`
            : `0 0 15px ${node.glowColor}15, 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)`,
          padding: '16px 14px 14px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Gradient shimmer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at 50% 0%, ${node.glowColor}15 0%, transparent 70%)`,
            borderRadius: '18px',
            pointerEvents: 'none',
          }}
        />

        {/* Status dot */}
        <div className="absolute top-3 right-3 flex items-center gap-1">
          {isPlaying && (
            <motion.div
              animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: node.glowColor,
                boxShadow: `0 0 6px ${node.glowColor}`,
              }}
            />
          )}
          {!isPlaying && (
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
          )}
        </div>

        {/* Icon */}
        <div className="text-center mb-2.5" style={{ fontSize: '2rem', lineHeight: 1 }}>
          {node.icon}
        </div>

        {/* Labels */}
        <div className="text-center" style={{ color: '#fff', fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em' }}>
          {node.label}
        </div>
        <div className="text-center mt-0.5" style={{ color: node.glowColor + 'BB', fontSize: '10px' }}>
          {node.sublabel}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: `${node.glowColor}25`, margin: '10px 0 8px' }} />

        {/* Quick metric */}
        {Object.entries(node.metrics).slice(0, 1).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: '10px' }}>{k}</span>
            <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: '10px', fontWeight: 600 }}>{v}</span>
          </div>
        ))}

        {/* Click hint */}
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: 6, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, color: node.glowColor + 'CC', fontSize: '9px' }}
          >
            View details <ChevronRight size={9} />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function FlowDashboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const speedRef = useRef(1);
  const canvasSizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [speed, setSpeed] = useState(1);
  const [stats, setStats] = useState<Stats>({ requests: 0, videos: 0, workers: 0, mbProcessed: 0 });
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // ── Draw function ──────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = canvasSizeRef.current;
    const dpr = dprRef.current;
    if (w < 10 || h < 10) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const now = performance.now();
    const midY = h * 0.5;

    // ── Node ambient halos ──
    NODES.forEach(node => {
      const nx = (node.xPercent / 100) * w;
      const pulse = (Math.sin(now * 0.0012 + node.xPercent) * 0.5 + 0.5);
      const radius = 90 + pulse * 20;
      const grd = ctx.createRadialGradient(nx, midY, 5, nx, midY, radius);
      grd.addColorStop(0, node.glowColor + '28');
      grd.addColorStop(0.5, node.glowColor + '0A');
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(nx, midY, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Connection paths ──
    CONNECTIONS.forEach((conn, idx) => {
      const fwd = getPath(idx, 'forward', w, h);
      const bwd = getPath(idx, 'backward', w, h);
      const fwdGrd = ctx.createLinearGradient(fwd.srcX, 0, fwd.dstX, 0);
      fwdGrd.addColorStop(0, conn.forwardColors[0] + '55');
      fwdGrd.addColorStop(1, conn.forwardColors[1] + '55');

      ctx.beginPath();
      ctx.moveTo(fwd.srcX, fwd.srcY);
      ctx.bezierCurveTo(fwd.cp1x, fwd.cp1y, fwd.cp2x, fwd.cp2y, fwd.dstX, fwd.dstY);
      ctx.strokeStyle = fwdGrd;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 14]);
      ctx.lineDashOffset = -(now * 0.04) % 24;
      ctx.stroke();

      const bwdGrd = ctx.createLinearGradient(bwd.srcX, 0, bwd.dstX, 0);
      bwdGrd.addColorStop(0, conn.backwardColors[0] + '35');
      bwdGrd.addColorStop(1, conn.backwardColors[1] + '35');

      ctx.beginPath();
      ctx.moveTo(bwd.srcX, bwd.srcY);
      ctx.bezierCurveTo(bwd.cp1x, bwd.cp1y, bwd.cp2x, bwd.cp2y, bwd.dstX, bwd.dstY);
      ctx.strokeStyle = bwdGrd;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 18]);
      ctx.lineDashOffset = (now * 0.03) % 23;
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // ── Active node rings (when playing) ──
    if (isPlayingRef.current) {
      NODES.forEach(node => {
        const nx = (node.xPercent / 100) * w;
        const pulse = Math.sin(now * 0.002 + node.xPercent * 0.3) * 0.5 + 0.5;
        const ringR = 58 + pulse * 14;
        const ringAlpha = (0.12 + pulse * 0.18).toFixed(2);
        ctx.beginPath();
        ctx.arc(nx, midY, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = node.glowColor + Math.round(parseFloat(ringAlpha) * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    // ── Update & draw particles ──
    const spd = speedRef.current;
    particlesRef.current = particlesRef.current
      .map(p => {
        const newT = p.t + p.speed * spd;
        if (newT >= 1.0) return { ...p, t: newT };
        const path = getPath(p.connIdx, p.direction, w, h);
        const pos = getPointOnPath(Math.min(newT, 1), path);
        const newHistory = [{ x: pos.x, y: pos.y }, ...p.history.slice(0, 11)];
        return { ...p, t: newT, history: newHistory };
      })
      .filter(p => p.t < 1.08);

    particlesRef.current.forEach(p => {
      const path = getPath(p.connIdx, p.direction, w, h);
      const pos = getPointOnPath(Math.min(p.t, 1), path);

      // Trail
      p.history.forEach((hp, i) => {
        const trailA = p.alpha * (1 - i / (p.history.length + 1)) * 0.55;
        const trailR = p.size * (1 - (i / (p.history.length + 2)) * 0.75);
        ctx.globalAlpha = trailA;
        ctx.shadowColor = p.colors[0];
        ctx.shadowBlur = 10;
        ctx.fillStyle = p.colors[Math.min(i, p.colors.length - 1)];
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, trailR, 0, Math.PI * 2);
        ctx.fill();
      });

      // Core particle
      ctx.globalAlpha = p.alpha;
      ctx.shadowColor = p.colors[0];
      ctx.shadowBlur = 22;
      ctx.fillStyle = p.colors[0];
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      // Inner white core
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.size * 0.38, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    });

    ctx.restore();
  }, []);

  const animate = useCallback(() => {
    draw();
    animFrameRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // ── Canvas Setup / Resize ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      dprRef.current = dpr;
      canvasSizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [animate]);

  // ── Particle Spawner ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      CONNECTIONS.forEach((_, idx) => {
        if (Math.random() > 0.15) particlesRef.current.push(makeParticle(idx, 'forward'));
        if (Math.random() > 0.35) particlesRef.current.push(makeParticle(idx, 'backward'));
      });
    }, 320);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // ── Stats Ticker ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setStats(s => ({
        requests: s.requests + Math.floor(Math.random() * 6 + 1),
        videos: s.videos + (Math.random() > 0.62 ? 1 : 0),
        workers: Math.max(1, Math.floor(s.workers + (Math.random() > 0.5 ? 1 : -1))),
        mbProcessed: s.mbProcessed + Math.floor(Math.random() * 180 + 40),
      }));
      setTick(t => t + 1);
    }, 700);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // ── Auto-play ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAutoPlay) return;
    setIsPlaying(true);
  }, [isAutoPlay]);

  const handleReset = () => {
    setIsPlaying(false);
    particlesRef.current = [];
    setStats({ requests: 0, videos: 0, workers: 0, mbProcessed: 0 });
    setTick(0);
  };

  const formatMB = (mb: number) => (mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb + ' MB');

  // ── Stat Cards ────────────────────────────────────────────────────────────
  const statCards = [
    { icon: <Activity size={13} />, label: 'Requests', value: stats.requests.toLocaleString(), color: '#8B5CF6' },
    { icon: <Video size={13} />, label: 'Videos Gen.', value: stats.videos.toString(), color: '#EC4899' },
    { icon: <Server size={13} />, label: 'Workers', value: stats.workers.toString(), color: '#06B6D4' },
    { icon: <Database size={13} />, label: 'Processed', value: formatMB(stats.mbProcessed), color: '#F59E0B' },
  ];

  return (
    <div
      className="relative w-full h-full overflow-hidden flex flex-col select-none"
      style={{ background: 'linear-gradient(135deg, #08011a 0%, #0c0a28 35%, #05101f 70%, #060214 100%)' }}
    >
      {/* ── Header ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-6 py-3"
        style={{
          background: 'rgba(255,255,255,0.025)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          zIndex: 20,
        }}
      >
        {/* Title */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)', boxShadow: '0 0 16px #8B5CF640' }}
          >
            <Zap size={15} className="text-white" />
          </div>
          <div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                background: 'linear-gradient(90deg, #C4B5FD, #93C5FD, #67E8F9)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '0.01em',
              }}
            >
              RunPod VideoGen
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: 1, letterSpacing: '0.08em' }}>
              SYSTEM ARCHITECTURE
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3">
          {statCards.map(s => (
            <motion.div
              key={s.label}
              animate={{ opacity: isPlaying ? 1 : 0.5 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: `${s.color}12`, border: `1px solid ${s.color}25` }}
            >
              <span style={{ color: s.color }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>{s.label}</div>
                <motion.div
                  key={tick}
                  initial={{ y: -6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  style={{ fontSize: '13px', color: '#fff', fontWeight: 700, lineHeight: 1.2 }}
                >
                  {s.value}
                </motion.div>
              </div>
            </motion.div>
          ))}

          {/* Status badge */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <motion.div
              animate={isPlaying ? { scale: [1, 1.5, 1], opacity: [1, 0.4, 1] } : { scale: 1, opacity: 0.3 }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: isPlaying ? '#22c55e' : 'rgba(255,255,255,0.3)', boxShadow: isPlaying ? '0 0 8px #22c55e' : 'none' }}
            />
            <span style={{ fontSize: '11px', color: isPlaying ? '#86efac' : 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
              {isPlaying ? 'RUNNING' : 'IDLE'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Canvas / Flow Area ── */}
      <div ref={containerRef} className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0" style={{ zIndex: 1 }} />

        {/* Connection labels */}
        {CONNECTIONS.map((conn, i) => {
          const midX = (NODES[conn.from].xPercent + NODES[conn.to].xPercent) / 2;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${midX}%`,
                top: 'calc(50% - 96px)',
                transform: 'translateX(-50%)',
                zIndex: 5,
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  color: 'rgba(255,255,255,0.35)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '2px 8px',
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {conn.label}
              </div>
            </div>
          );
        })}

        {/* Response path labels */}
        {CONNECTIONS.map((conn, i) => {
          const midX = (NODES[conn.from].xPercent + NODES[conn.to].xPercent) / 2;
          return (
            <div
              key={`r-${i}`}
              style={{
                position: 'absolute',
                left: `${midX}%`,
                top: 'calc(50% + 78px)',
                transform: 'translateX(-50%)',
                zIndex: 5,
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  color: 'rgba(255,255,255,0.2)',
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                }}
              >
                ← response
              </div>
            </div>
          );
        })}

        {/* Node Cards */}
        {NODES.map(node => (
          <NodeCard
            key={node.id}
            node={node}
            isPlaying={isPlaying}
            isSelected={selectedNode?.id === node.id}
            onClick={() => setSelectedNode(prev => (prev?.id === node.id ? null : node))}
          />
        ))}

        {/* Phase legend */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {[
            { color1: '#8B5CF6', color2: '#22D3EE', label: 'Request flow (client → storage)' },
            { color1: '#F59E0B', color2: '#A78BFA', label: 'Response flow (storage → client)' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {[item.color1, item.color2].map((c, j) => (
                  <div
                    key={j}
                    style={{
                      width: 16,
                      height: 3,
                      borderRadius: 2,
                      background: c,
                      opacity: 0.8,
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* Node count badge */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            right: selectedNode ? 340 : 16,
            zIndex: 10,
            fontSize: '10px',
            color: 'rgba(255,255,255,0.3)',
            letterSpacing: '0.06em',
            transition: 'right 0.4s ease',
          }}
        >
          {particlesRef.current.length} active particles
        </div>

        {/* Info Panel */}
        <AnimatePresence>
          {selectedNode && (
            <InfoPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
          )}
        </AnimatePresence>
      </div>

      {/* ── Control Bar ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-6 py-3"
        style={{
          background: 'rgba(255,255,255,0.025)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          zIndex: 20,
        }}
      >
        {/* Left: controls */}
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(p => !p)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              background: isPlaying
                ? 'linear-gradient(135deg, #7C3AED, #4F46E5)'
                : 'linear-gradient(135deg, #059669, #0D9488)',
              boxShadow: isPlaying
                ? '0 0 20px #7C3AED60, 0 4px 12px rgba(0,0,0,0.3)'
                : '0 0 20px #05966960, 0 4px 12px rgba(0,0,0,0.3)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span style={{ fontSize: '12px', fontWeight: 600 }}>{isPlaying ? 'Pause' : 'Start'}</span>
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={13} />
            <span style={{ fontSize: '12px', fontWeight: 500 }}>Reset</span>
          </button>

          {/* Auto-play toggle */}
          <button
            onClick={() => setIsAutoPlay(a => !a)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200"
            style={{
              background: isAutoPlay ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isAutoPlay ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: isAutoPlay ? '#A78BFA' : 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 500 }}>Auto-Play</span>
            <div
              style={{
                width: 28,
                height: 15,
                borderRadius: 8,
                background: isAutoPlay ? '#8B5CF6' : 'rgba(255,255,255,0.15)',
                position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <div
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 2,
                  left: isAutoPlay ? 15 : 2,
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </div>
          </button>
        </div>

        {/* Center: speed */}
        <div className="flex items-center gap-3">
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>SPEED</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0.5, 1, 1.5, 2].map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontSize: '11px',
                  fontWeight: 600,
                  background: speed === s ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${speed === s ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                  color: speed === s ? '#C4B5FD' : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* Right: node hint */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
            CLICK A NODE TO INSPECT
          </span>
          <div style={{ display: 'flex', gap: 3 }}>
            {NODES.map(n => (
              <div
                key={n.id}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: selectedNode?.id === n.id ? n.glowColor : 'rgba(255,255,255,0.15)',
                  transition: 'background 0.2s',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedNode(prev => (prev?.id === n.id ? null : n))}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}