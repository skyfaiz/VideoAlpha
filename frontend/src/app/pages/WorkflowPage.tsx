import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight, ChevronLeft, Upload, X, Image, Film,
  Sparkles, Check, Download, RefreshCw, Users, Zap,
  Monitor, Sliders, RotateCcw, Music, AlertCircle, Link2,
  FolderOpen, Code2, Gauge, HardDrive, CloudUpload
} from 'lucide-react';
import {
  submitInfinitetalkJob,
  getInfinitetalkStatus,
  getInfinitetalkDownloadUrl,
  saveJob,
  updateJobStatus,
} from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type WorkflowType = 'i2v-single' | 'i2v-multi' | 'v2v-single' | 'v2v-multi';
type InputMode = 'upload_s3' | 'upload_base64' | 'url' | 'path' | 'base64';
type Audio2Mode = InputMode | 'same';

interface MediaState {
  mode: InputMode;
  file: File | null;
  previewUrl: string;
  url: string;
  path: string;
  base64: string;
}

interface AudioState {
  mode: InputMode;
  file: File | null;
  url: string;
  path: string;
  base64: string;
}

interface Audio2State extends Omit<AudioState, 'mode'> {
  mode: Audio2Mode;
}

const emptyMedia = (): MediaState => ({ mode: 'upload_s3', file: null, previewUrl: '', url: '', path: '', base64: '' });
const emptyAudio = (): AudioState => ({ mode: 'upload_s3', file: null, url: '', path: '', base64: '' });
const emptyAudio2 = (): Audio2State => ({ mode: 'same', file: null, url: '', path: '', base64: '' });

interface Config {
  resolutionPreset: '512x512' | '544x960' | '720x1280' | '1080x1920' | 'custom';
  width: number;
  height: number;
  prompt: string;
  autoMaxFrame: boolean;
  maxFrame: number;
  forceOffload: boolean;
  networkVolume: boolean;
}

const RESOLUTION_PRESETS: Record<string, { width: number; height: number; label: string; desc: string }> = {
  '512x512': { width: 512, height: 512, label: '512×512', desc: 'Square (Default)' },
  '544x960': { width: 544, height: 960, label: '544×960', desc: 'Portrait (Fast)' },
  '720x1280': { width: 720, height: 1280, label: '720×1280', desc: 'HD Portrait' },
  '1080x1920': { width: 1080, height: 1920, label: '1080×1920', desc: 'Full HD' },
};

// ─── Workflow Card ─────────────────────────────────────────────────────────────
const WORKFLOW_TYPES = [
  {
    id: 'i2v-single' as WorkflowType,
    icon: '👤',
    label: 'I2V Single',
    sublabel: 'Image → Video',
    desc: 'Transform a single person portrait image into a natural talking video',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.1)',
    tags: ['Image input', '1 person', 'Fast'],
    animation: ['👤', '→', '🎬'],
  },
  {
    id: 'i2v-multi' as WorkflowType,
    icon: '👥',
    label: 'I2V Multi',
    sublabel: 'Image → Video',
    desc: 'Animate multiple people talking in a single portrait photo',
    color: '#06B6D4',
    bg: 'rgba(6,182,212,0.1)',
    tags: ['Image input', 'Multi-person', '2 Audio Tracks'],
    animation: ['👥', '→', '🎬'],
  },
  {
    id: 'v2v-single' as WorkflowType,
    icon: '🎬',
    label: 'V2V Single',
    sublabel: 'Video → Video',
    desc: 'Synchronize lip movements on an existing single-person video',
    color: '#EC4899',
    bg: 'rgba(236,72,153,0.1)',
    tags: ['Video input', '1 person', 'Lip-Sync'],
    animation: ['🎬', '→', '✨'],
  },
  {
    id: 'v2v-multi' as WorkflowType,
    icon: '🎭',
    label: 'V2V Multi',
    sublabel: 'Video → Video',
    desc: 'Multi-person video lip-sync with dual audio tracks',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.1)',
    tags: ['Video input', 'Multi-person', 'Advanced'],
    animation: ['🎭', '→', '🌟'],
  },
];

const MODE_TABS: { id: InputMode; label: string; icon: React.ElementType }[] = [
  { id: 'upload_s3', label: 'Upload (S3)', icon: CloudUpload },
  { id: 'upload_base64', label: 'Upload (Base64)', icon: Upload },
  { id: 'url', label: 'URL', icon: Link2 },
  { id: 'path', label: 'Volume Path', icon: FolderOpen },
  { id: 'base64', label: 'Raw Base64', icon: Code2 },
];

// ─── Step Indicator ────────────────────────────────────────────────────────────
function StepIndicator({ step, total, onStepClick }: { step: number; total: number; onStepClick?: (s: number) => void }) {
  const labels = ['Workflow', 'Inputs', 'Configure', 'Generate'];
  return (
    <div className="flex items-center gap-0 w-full">
      {Array.from({ length: total }).map((_, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <React.Fragment key={i}>
            <div
              onClick={() => done && onStepClick?.(i)}
              className={`flex flex-col items-center ${done ? 'cursor-pointer' : ''}`}
            >
              <motion.div
                animate={{
                  background: done
                    ? 'linear-gradient(135deg,#8B5CF6,#06B6D4)'
                    : active
                    ? 'rgba(139,92,246,0.3)'
                    : 'rgba(255,255,255,0.08)',
                  borderColor: done || active ? '#8B5CF6' : 'rgba(255,255,255,0.12)',
                  scale: active ? 1.08 : 1,
                }}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center"
                style={{
                  border: '2px solid',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: done || active ? '#fff' : 'rgba(255,255,255,0.3)',
                }}
              >
                {done ? <Check size={13} /> : i + 1}
              </motion.div>
              <div
                style={{
                  fontSize: '10px',
                  color: active ? '#A78BFA' : 'rgba(255,255,255,0.35)',
                  marginTop: 4,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {labels[i]}
              </div>
            </div>
            {i < total - 1 && (
              <div
                className="flex-1 mx-1.5 sm:mx-2 mb-4"
                style={{
                  height: 2,
                  background: done ? 'linear-gradient(90deg,#8B5CF6,#06B6D4)' : 'rgba(255,255,255,0.08)',
                  minWidth: 20,
                  borderRadius: 1,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Step 1: Workflow Selection ─────────────────────────────────────────────
function StepWorkflow({ selected, onSelect }: { selected: WorkflowType | null; onSelect: (w: WorkflowType) => void }) {
  return (
    <div>
      <div className="mb-5">
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }}>Choose Workflow</h2>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
          Select the InfiniteTalk generation mode that fits your media
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {WORKFLOW_TYPES.map((wf, i) => (
          <motion.div
            key={wf.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 280, damping: 26 }}
            whileHover={{ y: -3, scale: 1.01 }}
            onClick={() => onSelect(wf.id)}
            className="rounded-2xl p-4 sm:p-5 cursor-pointer relative overflow-hidden"
            style={{
              background: selected === wf.id ? wf.bg : 'rgba(255,255,255,0.03)',
              border: `1.5px solid ${selected === wf.id ? wf.color + '60' : 'rgba(255,255,255,0.07)'}`,
              boxShadow: selected === wf.id ? `0 0 28px ${wf.color}22` : 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
          >
            {selected === wf.id && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: wf.color }}
              >
                <Check size={11} className="text-white" />
              </motion.div>
            )}
            <div className="flex items-center gap-1.5 mb-3" style={{ fontSize: '22px' }}>
              {wf.animation.map((a, ai) => (
                <motion.span
                  key={ai}
                  animate={selected === wf.id ? { y: [0, -3, 0] } : { y: 0 }}
                  transition={{ repeat: Infinity, duration: 1.5, delay: ai * 0.2 }}
                >
                  {a}
                </motion.span>
              ))}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC' }}>{wf.label}</div>
            <div style={{ fontSize: '11px', color: wf.color, marginTop: 2, fontWeight: 600 }}>{wf.sublabel}</div>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: 6, lineHeight: 1.5 }}>{wf.desc}</p>
            <div className="flex gap-1.5 mt-3.5 flex-wrap">
              {wf.tags.map(t => (
                <span
                  key={t}
                  style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: 20,
                    background: `${wf.color}18`,
                    color: wf.color,
                    border: `1px solid ${wf.color}30`,
                    fontWeight: 600,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Mode Tabs (shared by media/audio pickers) ─────────────────────────────────
function ModeTabs({
  value,
  onChange,
  accent,
  extraOption,
}: {
  value: InputMode | Audio2Mode;
  onChange: (m: any) => void;
  accent: string;
  extraOption?: { id: string; label: string; icon: React.ElementType };
}) {
  const tabs = extraOption ? [extraOption, ...MODE_TABS] : MODE_TABS;
  return (
    <div className="flex gap-1.5 mb-3 flex-wrap">
      {tabs.map(tab => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{
              background: active ? `${accent}22` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${active ? `${accent}60` : 'rgba(255,255,255,0.08)'}`,
              cursor: 'pointer',
            }}
          >
            <tab.icon size={11} style={{ color: active ? accent : 'rgba(255,255,255,0.4)' }} />
            <span
              style={{
                fontSize: '11px',
                fontWeight: active ? 600 : 400,
                color: active ? accent : 'rgba(255,255,255,0.5)',
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const textInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  fontSize: '12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#F8FAFC',
  outline: 'none',
};

// ─── Media (image/video) picker ────────────────────────────────────────────────
function MediaPicker({
  state,
  onChange,
  kind,
  accent,
}: {
  state: MediaState;
  onChange: (s: MediaState) => void;
  kind: 'image' | 'video';
  accent: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const setFile = (file: File | null) => {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    onChange({ ...state, file, previewUrl: file ? URL.createObjectURL(file) : '' });
  };

  const isUpload = state.mode === 'upload_s3' || state.mode === 'upload_base64';

  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {kind === 'image' ? <Image size={14} style={{ color: accent }} /> : <Film size={14} style={{ color: accent }} />}
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>
            {kind === 'image' ? 'Image' : 'Video'} Source
          </span>
        </div>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>
          {state.mode === 'upload_s3'
            ? `S3 → ${kind}_path`
            : state.mode === 'upload_base64'
            ? `File → ${kind}_base64`
            : `${kind}_${state.mode}`}
        </span>
      </div>

      <ModeTabs value={state.mode} onChange={(m: InputMode) => onChange({ ...state, mode: m })} accent={accent} />

      {isUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={kind === 'image' ? 'image/*' : 'video/*'}
            className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          {!state.file ? (
            <motion.div
              animate={{
                borderColor: dragging ? accent : 'rgba(255,255,255,0.1)',
                background: dragging ? `${accent}14` : 'rgba(255,255,255,0.02)',
              }}
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                setFile(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => inputRef.current?.click()}
              className="rounded-xl flex flex-col items-center justify-center cursor-pointer p-4 text-center"
              style={{ border: '2px dashed rgba(255,255,255,0.1)', minHeight: 110 }}
            >
              <Upload size={18} style={{ color: dragging ? accent : 'rgba(255,255,255,0.4)', marginBottom: 6 }} />
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                Tap or drop {kind} file ({state.mode === 'upload_s3' ? 'uploads to S3 volume' : 'encodes as Base64'})
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                {kind === 'image' ? 'JPG, PNG, WebP' : 'MP4, MOV, AVI'} · up to 200MB
              </div>
            </motion.div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: `${accent}12`, border: `1px solid ${accent}25` }}>
              {kind === 'image' ? (
                <img src={state.previewUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
              ) : (
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <Film size={16} style={{ color: accent }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate" style={{ fontSize: '11px', color: '#F8FAFC' }}>
                  {state.file.name}
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
                  {(state.file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
              <button type="button" onClick={() => setFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
              </button>
            </div>
          )}
        </>
      )}

      {state.mode === 'url' && (
        <input
          type="text"
          value={state.url}
          onChange={e => onChange({ ...state, url: e.target.value })}
          placeholder={`https://example.com/${kind === 'image' ? 'portrait.jpg' : 'video.mp4'}`}
          style={textInputStyle}
        />
      )}

      {state.mode === 'path' && (
        <div className="space-y-2">
          <input
            type="text"
            value={state.path}
            onChange={e => onChange({ ...state, path: e.target.value })}
            placeholder={`/runpod-volume/${kind === 'image' ? 'portrait.jpg' : 'video.mp4'} or /examples/image.jpg`}
            style={textInputStyle}
          />
          {kind === 'image' && (
            <button
              type="button"
              onClick={() => onChange({ ...state, path: '/examples/image.jpg' })}
              style={{
                fontSize: '10px',
                color: '#A78BFA',
                background: 'rgba(139,92,246,0.12)',
                border: '1px solid rgba(139,92,246,0.25)',
                padding: '3px 8px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Use built-in example: /examples/image.jpg
            </button>
          )}
        </div>
      )}

      {state.mode === 'base64' && (
        <textarea
          value={state.base64}
          onChange={e => onChange({ ...state, base64: e.target.value })}
          placeholder={`data:${kind}/${kind === 'image' ? 'jpeg' : 'mp4'};base64,...`}
          rows={3}
          style={{ ...textInputStyle, resize: 'none', fontFamily: 'monospace' }}
        />
      )}
    </div>
  );
}

// ─── Audio picker ──────────────────────────────────────────────────────────────
function AudioPicker({
  state,
  onChange,
  label,
  accent,
  extraOption,
}: {
  state: AudioState | Audio2State;
  onChange: (s: any) => void;
  label: string;
  accent: string;
  extraOption?: { id: string; label: string; icon: React.ElementType };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const isSame = (state as Audio2State).mode === 'same';
  const isUpload = state.mode === 'upload_s3' || state.mode === 'upload_base64';

  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Music size={14} style={{ color: accent }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>{label}</span>
        </div>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>
          {isSame
            ? 'Fallback to Audio 1'
            : state.mode === 'upload_s3'
            ? 'S3 → wav_path'
            : state.mode === 'upload_base64'
            ? 'File → wav_base64'
            : `wav_${state.mode}`}
        </span>
      </div>

      <ModeTabs value={state.mode} onChange={(m: any) => onChange({ ...state, mode: m })} accent={accent} extraOption={extraOption} />

      {isSame && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Users size={13} style={{ color: 'rgba(255,255,255,0.4)' }} />
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Worker will reuse Person 1's audio</span>
        </div>
      )}

      {!isSame && isUpload && (
        <>
          <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={e => onChange({ ...state, file: e.target.files?.[0] ?? null })} />
          {!state.file ? (
            <motion.div
              animate={{
                borderColor: dragging ? accent : 'rgba(255,255,255,0.1)',
                background: dragging ? `${accent}14` : 'rgba(255,255,255,0.02)',
              }}
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                onChange({ ...state, file: e.dataTransfer.files?.[0] ?? null });
              }}
              onClick={() => inputRef.current?.click()}
              className="rounded-xl flex flex-col items-center justify-center cursor-pointer p-4 text-center"
              style={{ border: '2px dashed rgba(255,255,255,0.1)', minHeight: 90 }}
            >
              <Music size={16} style={{ color: dragging ? accent : 'rgba(255,255,255,0.4)', marginBottom: 6 }} />
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                Tap or drop audio ({state.mode === 'upload_s3' ? 'uploads to S3 volume' : 'encodes as Base64'})
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>WAV, MP3, M4A · up to 200MB</div>
            </motion.div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: `${accent}12`, border: `1px solid ${accent}25` }}>
              <Music size={14} style={{ color: accent }} />
              <div className="flex-1 min-w-0">
                <div className="truncate" style={{ fontSize: '11px', color: '#F8FAFC' }}>
                  {state.file.name}
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
                  {(state.file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
              <button type="button" onClick={() => onChange({ ...state, file: null })} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
              </button>
            </div>
          )}
        </>
      )}

      {!isSame && state.mode === 'url' && (
        <input
          type="text"
          value={state.url}
          onChange={e => onChange({ ...state, url: e.target.value })}
          placeholder="https://example.com/audio.wav"
          style={textInputStyle}
        />
      )}

      {!isSame && state.mode === 'path' && (
        <div className="space-y-2">
          <input
            type="text"
            value={state.path}
            onChange={e => onChange({ ...state, path: e.target.value })}
            placeholder="/runpod-volume/audio.wav or /examples/audio.mp3"
            style={textInputStyle}
          />
          <button
            type="button"
            onClick={() => onChange({ ...state, path: '/examples/audio.mp3' })}
            style={{
              fontSize: '10px',
              color: '#F472B6',
              background: 'rgba(236,72,153,0.12)',
              border: '1px solid rgba(236,72,153,0.25)',
              padding: '3px 8px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Use built-in example: /examples/audio.mp3
          </button>
        </div>
      )}

      {!isSame && state.mode === 'base64' && (
        <textarea
          value={state.base64}
          onChange={e => onChange({ ...state, base64: e.target.value })}
          placeholder="data:audio/wav;base64,..."
          rows={3}
          style={{ ...textInputStyle, resize: 'none', fontFamily: 'monospace' }}
        />
      )}
    </div>
  );
}

// ─── Step 2: Upload ────────────────────────────────────────────────────────────
function StepUpload({
  workflowType,
  media,
  onMediaChange,
  audio1,
  onAudio1Change,
  audio2,
  onAudio2Change,
}: {
  workflowType: WorkflowType | null;
  media: MediaState;
  onMediaChange: (s: MediaState) => void;
  audio1: AudioState;
  onAudio1Change: (s: AudioState) => void;
  audio2: Audio2State;
  onAudio2Change: (s: Audio2State) => void;
}) {
  const isImage = workflowType?.startsWith('i2v');
  const isMultiPerson = workflowType?.endsWith('multi');

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }}>Provide Inputs</h2>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
          Upload via S3 or Base64, pass a direct URL, specify a volume path, or paste raw Base64.
        </p>
      </div>

      <MediaPicker state={media} onChange={onMediaChange} kind={isImage ? 'image' : 'video'} accent="#8B5CF6" />

      <AudioPicker state={audio1} onChange={onAudio1Change} label={isMultiPerson ? 'Audio — Person 1' : 'Speech Audio'} accent="#EC4899" />

      {isMultiPerson && (
        <AudioPicker
          state={audio2}
          onChange={onAudio2Change}
          label="Audio — Person 2"
          accent="#F59E0B"
          extraOption={{ id: 'same', label: 'Same as Person 1', icon: Users }}
        />
      )}
    </div>
  );
}

// ─── Step 3: Configure ─────────────────────────────────────────────────────────────
function StepConfigure({ config, onChange }: { config: Config; onChange: (c: Partial<Config>) => void }) {
  return (
    <div>
      <div className="mb-5">
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }}>Configure Parameters</h2>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
          Fine-tune prompt, dimensions, frame count, and GPU offloading
        </p>
      </div>
      <div className="space-y-4">
        {/* Prompt */}
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} style={{ color: '#8B5CF6' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>Prompt</span>
          </div>
          <textarea
            value={config.prompt}
            onChange={e => onChange({ prompt: e.target.value })}
            placeholder="Describe how the person should talk or act..."
            rows={3}
            style={{ ...textInputStyle, padding: '12px', borderRadius: 12, resize: 'none' }}
          />
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
            Example: "A person talking naturally with subtle head movements"
          </div>
        </div>

        {/* Resolution */}
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Monitor size={14} style={{ color: '#06B6D4' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>Output Resolution (width × height)</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {Object.entries(RESOLUTION_PRESETS).map(([id, r]) => (
              <motion.button
                key={id}
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onChange({ resolutionPreset: id as Config['resolutionPreset'], width: r.width, height: r.height })}
                className="rounded-xl p-2.5 text-center"
                style={{
                  background: config.resolutionPreset === id ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1.5px solid ${config.resolutionPreset === id ? '#06B6D4' : 'rgba(255,255,255,0.07)'}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: config.resolutionPreset === id ? '#22D3EE' : 'rgba(255,255,255,0.7)' }}>
                  {r.label}
                </div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{r.desc}</div>
              </motion.button>
            ))}
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange({ resolutionPreset: 'custom' })}
              className="rounded-xl p-2.5 text-center col-span-2 sm:col-span-1"
              style={{
                background: config.resolutionPreset === 'custom' ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${config.resolutionPreset === 'custom' ? '#06B6D4' : 'rgba(255,255,255,0.07)'}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: config.resolutionPreset === 'custom' ? '#22D3EE' : 'rgba(255,255,255,0.7)' }}>
                Custom
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Manual px</div>
            </motion.button>
          </div>

          {config.resolutionPreset === 'custom' && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Width (px)</div>
                <input
                  type="number"
                  min={64}
                  step={16}
                  value={config.width}
                  onChange={e => onChange({ width: parseInt(e.target.value) || 0 })}
                  style={textInputStyle}
                />
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Height (px)</div>
                <input
                  type="number"
                  min={64}
                  step={16}
                  value={config.height}
                  onChange={e => onChange({ height: parseInt(e.target.value) || 0 })}
                  style={textInputStyle}
                />
              </div>
            </div>
          )}
        </div>

        {/* Max frames */}
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sliders size={14} style={{ color: '#A78BFA' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>Max Frames (max_frame)</span>
            </div>
            <ToggleSwitch value={!config.autoMaxFrame} onChange={v => onChange({ autoMaxFrame: !v })} color="#A78BFA" />
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: config.autoMaxFrame ? 0 : 10 }}>
            {config.autoMaxFrame ? 'Auto-calculated from audio duration by the worker' : 'Manually override maximum output frames'}
          </div>
          {!config.autoMaxFrame && (
            <input
              type="number"
              min={1}
              value={config.maxFrame}
              onChange={e => onChange({ maxFrame: parseInt(e.target.value) || 0 })}
              style={textInputStyle}
            />
          )}
        </div>

        {/* Force offload */}
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Gauge size={14} style={{ color: '#F59E0B', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>Force Offload (force_offload)</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
                  On prevents OOM on smaller GPUs · Off is ~1.5× faster on 24GB+ VRAM
                </div>
              </div>
            </div>
            <ToggleSwitch value={config.forceOffload} onChange={v => onChange({ forceOffload: v })} color="#F59E0B" />
          </div>
        </div>

        {/* Network volume output */}
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <HardDrive size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>Network Volume Output (network_volume)</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
                  Off returns Base64 video · On saves output to /runpod-volume/ and downloads via S3
                </div>
              </div>
            </div>
            <ToggleSwitch value={config.networkVolume} onChange={v => onChange({ networkVolume: v })} color="#22c55e" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ value, onChange, color }: { value: boolean; onChange: (v: boolean) => void; color: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="relative rounded-full flex-shrink-0"
      style={{ width: 40, height: 22, background: value ? color : 'rgba(255,255,255,0.12)', cursor: 'pointer', border: 'none' }}
    >
      <motion.div
        animate={{ x: value ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-1 rounded-full"
        style={{ width: 14, height: 14, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
      />
    </button>
  );
}

// ─── Step 4: Generate ──────────────────────────────────────────────────────────
function buildFormData(
  workflowType: WorkflowType,
  media: MediaState,
  audio1: AudioState,
  audio2: Audio2State,
  config: Config
): FormData {
  const formData = new FormData();
  const inputType = workflowType.startsWith('i2v') ? 'image' : 'video';
  const personCount = workflowType.endsWith('multi') ? 'multi' : 'single';
  const mediaField = inputType === 'image' ? 'image' : 'video';

  formData.append('input_type', inputType);
  formData.append('person_count', personCount);
  formData.append('prompt', config.prompt || 'A person talking naturally');
  formData.append('width', String(config.width));
  formData.append('height', String(config.height));
  formData.append('force_offload', String(config.forceOffload));
  formData.append('use_network_volume', String(config.networkVolume));
  if (!config.autoMaxFrame && config.maxFrame > 0) {
    formData.append('max_frame', String(config.maxFrame));
  }

  // Media
  formData.append('media_input_mode', media.mode);
  if ((media.mode === 'upload_s3' || media.mode === 'upload_base64') && media.file) {
    formData.append(mediaField, media.file);
  }
  if (media.mode === 'url') formData.append(`${mediaField}_url`, media.url);
  if (media.mode === 'path') formData.append(`${mediaField}_path`, media.path);
  if (media.mode === 'base64') formData.append(`${mediaField}_base64`, media.base64);

  // Audio 1
  formData.append('audio_input_mode', audio1.mode);
  if ((audio1.mode === 'upload_s3' || audio1.mode === 'upload_base64') && audio1.file) {
    formData.append('audio', audio1.file);
  }
  if (audio1.mode === 'url') formData.append('wav_url', audio1.url);
  if (audio1.mode === 'path') formData.append('wav_path', audio1.path);
  if (audio1.mode === 'base64') formData.append('wav_base64', audio1.base64);

  // Audio 2 (multi-person)
  if (personCount === 'multi') {
    if (audio2.mode === 'same') {
      formData.append('audio_2_input_mode', 'none');
    } else {
      formData.append('audio_2_input_mode', audio2.mode);
      if ((audio2.mode === 'upload_s3' || audio2.mode === 'upload_base64') && audio2.file) {
        formData.append('audio_2', audio2.file);
      }
      if (audio2.mode === 'url') formData.append('wav_url_2', audio2.url);
      if (audio2.mode === 'path') formData.append('wav_path_2', audio2.path);
      if (audio2.mode === 'base64') formData.append('wav_base64_2', audio2.base64);
    }
  }

  return formData;
}

function StepGenerate({
  workflowType,
  media,
  audio1,
  audio2,
  config,
}: {
  workflowType: WorkflowType | null;
  media: MediaState;
  audio1: AudioState;
  audio2: Audio2State;
  config: Config;
}) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [particles, setParticles] = useState<number[]>([]);
  const [, setJobId] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const STAGES = [
    'Uploading files...',
    'Initializing RunPod worker...',
    'Processing media...',
    'Running AI inference...',
    'Encoding output video...',
  ];

  const wf = WORKFLOW_TYPES.find(w => w.id === workflowType);
  const inputType = workflowType?.startsWith('i2v') ? 'image' : 'video';
  const personCount = workflowType?.endsWith('multi') ? 'multi' : 'single';

  const mediaSummary =
    media.mode === 'upload_s3' || media.mode === 'upload_base64'
      ? media.file?.name ?? 'No file'
      : media.mode === 'url'
      ? media.url || '—'
      : media.mode === 'path'
      ? media.path || '—'
      : media.base64
      ? 'Base64 string'
      : '—';

  const audioSummary =
    audio1.mode === 'upload_s3' || audio1.mode === 'upload_base64'
      ? audio1.file?.name ?? 'No file'
      : audio1.mode === 'url'
      ? audio1.url || '—'
      : audio1.mode === 'path'
      ? audio1.path || '—'
      : audio1.base64
      ? 'Base64 string'
      : '—';

  const generate = async () => {
    if (!workflowType) return;
    setState('running');
    setProgress(5);
    setStage(STAGES[0]);
    setError(null);

    let newJobId: string | null = null;
    try {
      const formData = buildFormData(workflowType, media, audio1, audio2, config);

      setProgress(10);
      setStage(STAGES[1]);
      const response = await submitInfinitetalkJob(formData);
      newJobId = response.job_id;
      setJobId(newJobId);

      // Record real job immediately
      saveJob({
        id: newJobId,
        type: wf?.label ?? 'I2V Single',
        name: mediaSummary,
        prompt: config.prompt,
        resolution: `${config.width}×${config.height}`,
        status: 'queued',
        progress: 10,
        createdAt: new Date().toISOString(),
      });

      let completed = false;
      let pollCount = 0;
      while (!completed && pollCount < 300) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        pollCount++;

        const status = await getInfinitetalkStatus(newJobId);

        if (status.status === 'IN_PROGRESS') {
          const newProgress = Math.min(20 + pollCount * 2, 90);
          setProgress(newProgress);
          const stageIdx = Math.min(Math.floor(newProgress / 25) + 1, STAGES.length - 1);
          setStage(STAGES[stageIdx]);
          updateJobStatus(newJobId, { status: 'processing', progress: newProgress });
        } else if (status.status === 'COMPLETED') {
          completed = true;
          setProgress(100);
          setStage('Complete!');
          setDownloadUrl(getInfinitetalkDownloadUrl(newJobId));
          setState('done');
          setParticles(Array.from({ length: 24 }, (_, i) => i));
          updateJobStatus(newJobId, {
            status: 'completed',
            progress: 100,
            size: status.size ?? null,
            completedAt: new Date().toISOString(),
          });
        } else if (status.status === 'FAILED') {
          const errMsg = status.error || 'Job failed';
          updateJobStatus(newJobId, { status: 'failed', progress: 0, error: errMsg });
          throw new Error(errMsg);
        }
      }

      if (!completed) {
        throw new Error('Job timed out');
      }
    } catch (err: any) {
      console.error('Generation error:', err);
      const msg = err?.response?.data?.detail || err.message || 'An error occurred';
      if (newJobId) {
        updateJobStatus(newJobId, { status: 'failed', progress: 0, error: msg });
      }
      setError(msg);
      setState('error');
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }}>
          {state === 'done'
            ? 'Generation Complete!'
            : state === 'running'
            ? 'Generating Video...'
            : state === 'error'
            ? 'Generation Failed'
            : 'Ready to Generate'}
        </h2>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
          {state === 'idle'
            ? 'Review your settings and start generation'
            : state === 'running'
            ? stage
            : state === 'error'
            ? 'Check the error details below'
            : 'Your video is ready to preview and download'}
        </p>
      </div>

      {/* Summary */}
      {state === 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 sm:p-5 mb-5"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 10, letterSpacing: '0.06em' }}>
            SUMMARY
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { label: 'Workflow', value: wf?.label ?? '—', color: wf?.color ?? '#8B5CF6' },
              { label: `${inputType === 'image' ? 'Image' : 'Video'} (${media.mode})`, value: mediaSummary, color: '#06B6D4' },
              { label: `Audio (${audio1.mode})`, value: audioSummary, color: '#EC4899' },
              { label: 'Resolution', value: `${config.width}×${config.height}`, color: '#F59E0B' },
              { label: 'Max Frames', value: config.autoMaxFrame ? 'Auto' : String(config.maxFrame), color: '#A78BFA' },
              { label: 'Force Offload', value: config.forceOffload ? 'On' : 'Off', color: '#F59E0B' },
              { label: 'Network Volume', value: config.networkVolume ? 'On' : 'Off', color: '#22c55e' },
              ...(personCount === 'multi'
                ? [{ label: 'Person 2 Audio', value: audio2.mode === 'same' ? 'Same as Person 1' : audio2.mode, color: '#F59E0B' }]
                : []),
            ].map(s => (
              <div
                key={s.label}
                className="flex items-center justify-between py-1.5 gap-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{s.label}</span>
                <span
                  className="truncate"
                  style={{ fontSize: '11px', fontWeight: 600, color: s.color, textAlign: 'right' }}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Prompt:</div>
            <div style={{ fontSize: '11px', color: '#C4B5FD', fontWeight: 500 }}>{config.prompt}</div>
          </div>
          <div
            className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)' }}
          >
            <Zap size={12} style={{ color: '#A78BFA', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
              Est. generation time: <span style={{ color: '#C4B5FD', fontWeight: 600 }}>~60–120s</span> · RunPod Serverless GPU
            </span>
          </div>
        </motion.div>
      )}

      {/* Progress ring */}
      {state === 'running' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center py-8"
        >
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <motion.circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="url(#grad)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 52}`}
                animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - progress / 100) }}
                transition={{ duration: 0.5 }}
              />
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#8B5CF6" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#F8FAFC', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(progress)}%
              </span>
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}
              >
                processing
              </motion.div>
            </div>
          </div>
          <motion.div
            key={stage}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: 16, textAlign: 'center' }}
          >
            {stage}
          </motion.div>
          <div className="flex gap-2 mt-4">
            {STAGES.map((_, i) => {
              const cur = Math.floor((progress / 100) * STAGES.length);
              return (
                <motion.div
                  key={i}
                  animate={{
                    background: i < cur ? '#8B5CF6' : i === cur ? '#06B6D4' : 'rgba(255,255,255,0.1)',
                    scale: i === cur ? 1.3 : 1,
                  }}
                  style={{ width: 6, height: 6, borderRadius: '50%' }}
                />
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Success */}
      {state === 'done' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative">
          <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ borderRadius: 16 }}>
            {particles.map(p => (
              <motion.div
                key={p}
                initial={{ x: Math.random() * 320, y: 260, opacity: 1, scale: 1 }}
                animate={{ y: -50, opacity: 0, scale: 0, rotate: Math.random() * 360 }}
                transition={{ duration: 1.5, delay: p * 0.05, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: ['#8B5CF6', '#06B6D4', '#EC4899', '#F59E0B', '#22c55e'][p % 5],
                }}
              />
            ))}
          </div>

          <div
            className="rounded-2xl overflow-hidden mb-4 relative"
            style={{ background: '#000', border: '1px solid rgba(139,92,246,0.3)' }}
          >
            {downloadUrl && <video src={downloadUrl} controls style={{ width: '100%', maxHeight: 360, display: 'block' }} />}
          </div>

          <div className="flex gap-3">
            <motion.a
              href={downloadUrl || '#'}
              download
              whileHover={{ scale: 1.02, boxShadow: '0 0 24px rgba(139,92,246,0.5)' }}
              whileTap={{ scale: 0.97 }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              <Download size={15} className="text-white" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Download MP4</span>
            </motion.a>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setState('idle');
                setProgress(0);
                setDownloadUrl(null);
              }}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>New Job</span>
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 sm:p-6 text-center"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <AlertCircle size={36} style={{ color: '#EF4444', margin: '0 auto 10px' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#F87171', marginBottom: 6 }}>Generation Failed</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginBottom: 14 }}>
            {error || 'An unknown error occurred'}
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setState('idle');
              setError(null);
            }}
            className="px-6 py-2.5 rounded-xl"
            style={{
              background: 'rgba(239,68,68,0.2)',
              border: '1px solid rgba(239,68,68,0.4)',
              cursor: 'pointer',
              color: '#F87171',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            Try Again
          </motion.button>
        </motion.div>
      )}

      {/* Generate button */}
      {state === 'idle' && (
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.02, boxShadow: '0 0 40px rgba(139,92,246,0.6)' }}
          whileTap={{ scale: 0.98 }}
          onClick={generate}
          className="w-full py-3.5 sm:py-4 rounded-2xl flex items-center justify-center gap-3 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #7C3AED, #0E7490)',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 0 24px rgba(139,92,246,0.35)',
          }}
        >
          <Sparkles size={18} style={{ color: '#fff' }} />
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Generate Video</span>
        </motion.button>
      )}
    </div>
  );
}

// ─── Main Workflow Page ────────────────────────────────────────────────────────
export function WorkflowPage() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [workflowType, setWorkflowType] = useState<WorkflowType | null>(null);
  const [media, setMedia] = useState<MediaState>(emptyMedia());
  const [audio1, setAudio1] = useState<AudioState>(emptyAudio());
  const [audio2, setAudio2] = useState<Audio2State>(emptyAudio2());
  const [config, setConfig] = useState<Config>({
    resolutionPreset: '544x960',
    width: 544,
    height: 960,
    prompt: 'A person talking naturally',
    autoMaxFrame: true,
    maxFrame: 150,
    forceOffload: true,
    networkVolume: false,
  });

  useEffect(() => {
    const preselect = searchParams.get('type') as WorkflowType | null;
    if (preselect && WORKFLOW_TYPES.some(w => w.id === preselect)) {
      setWorkflowType(preselect);
      setStep(1);
    }
  }, [searchParams]);

  const isMultiPerson = workflowType?.endsWith('multi');

  const isMediaValid = () => {
    switch (media.mode) {
      case 'upload_s3':
      case 'upload_base64':
        return !!media.file;
      case 'url':
        return media.url.trim().length > 0;
      case 'path':
        return media.path.trim().length > 0;
      case 'base64':
        return media.base64.trim().length > 0;
    }
  };

  const isAudioValid = (a: AudioState | Audio2State) => {
    switch (a.mode) {
      case 'upload_s3':
      case 'upload_base64':
        return !!a.file;
      case 'url':
        return a.url.trim().length > 0;
      case 'path':
        return a.path.trim().length > 0;
      case 'base64':
        return a.base64.trim().length > 0;
      case 'same':
        return true;
      default:
        return false;
    }
  };

  const canNext = [
    workflowType !== null,
    isMediaValid() && isAudioValid(audio1) && (!isMultiPerson || isAudioValid(audio2)),
    config.width >= 64 && config.height >= 64,
    true,
  ][step];

  const reset = () => {
    setStep(0);
    setWorkflowType(null);
    setMedia(emptyMedia());
    setAudio1(emptyAudio());
    setAudio2(emptyAudio2());
  };

  const steps = [
    <StepWorkflow
      key="wf"
      selected={workflowType}
      onSelect={t => {
        setWorkflowType(t);
        setMedia(emptyMedia());
        setAudio1(emptyAudio());
        setAudio2(emptyAudio2());
      }}
    />,
    <StepUpload
      key="up"
      workflowType={workflowType}
      media={media}
      onMediaChange={setMedia}
      audio1={audio1}
      onAudio1Change={setAudio1}
      audio2={audio2}
      onAudio2Change={setAudio2}
    />,
    <StepConfigure key="cfg" config={config} onChange={c => setConfig(prev => ({ ...prev, ...c }))} />,
    <StepGenerate key="gen" workflowType={workflowType} media={media} audio1={audio1} audio2={audio2} config={config} />,
  ];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content */}
      <div
        className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
      >
        <div className="max-w-2xl mx-auto">
          {/* Step indicator */}
          <div className="mb-6 sm:mb-8">
            <StepIndicator step={step} total={4} onStepClick={s => setStep(s)} />
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            >
              {steps[step]}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          {step < 3 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 mt-6 sm:mt-8">
              {step > 0 && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeft size={15} style={{ color: 'rgba(255,255,255,0.6)' }} />
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Back</span>
                </motion.button>
              )}
              <motion.button
                whileHover={canNext ? { scale: 1.02, boxShadow: '0 0 20px rgba(139,92,246,0.4)' } : {}}
                whileTap={canNext ? { scale: 0.97 } : {}}
                onClick={() => canNext && setStep(s => s + 1)}
                className="flex items-center gap-2 px-5 sm:px-6 py-2.5 rounded-xl"
                style={{
                  background: canNext ? 'linear-gradient(135deg, #8B5CF6, #06B6D4)' : 'rgba(255,255,255,0.06)',
                  border: 'none',
                  cursor: canNext ? 'pointer' : 'not-allowed',
                  boxShadow: canNext ? '0 0 16px rgba(139,92,246,0.3)' : 'none',
                  marginLeft: 'auto',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: canNext ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                  {step === 2 ? 'Review' : 'Continue'}
                </span>
                <ChevronRight size={15} style={{ color: canNext ? '#fff' : 'rgba(255,255,255,0.3)' }} />
              </motion.button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Right preview sidebar (desktop xl+) */}
      <div
        className="hidden xl:block w-72 flex-shrink-0 p-6 space-y-4"
        style={{ borderLeft: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}
      >
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>
          CURRENT SETUP
        </div>

        {workflowType &&
          (() => {
            const wf = WORKFLOW_TYPES.find(w => w.id === workflowType)!;
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl p-3"
                style={{ background: `${wf.color}12`, border: `1px solid ${wf.color}25` }}
              >
                <div className="text-xl mb-1">{wf.icon}</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>{wf.label}</div>
                <div style={{ fontSize: '10px', color: wf.color, marginTop: 2 }}>{wf.sublabel}</div>
              </motion.div>
            );
          })()}

        {step >= 1 && (
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>INPUT MODES</div>
            <div className="space-y-1.5">
              <div
                className="flex items-center justify-between rounded-lg px-2.5 py-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Media</span>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#C4B5FD' }}>{media.mode}</span>
              </div>
              <div
                className="flex items-center justify-between rounded-lg px-2.5 py-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Audio 1</span>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#F472B6' }}>{audio1.mode}</span>
              </div>
            </div>
          </div>
        )}

        {step >= 2 && (
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>CONFIG</div>
            <div className="space-y-1.5">
              <div
                className="flex justify-between rounded-lg px-2.5 py-1.5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>Resolution</span>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                  {config.width}×{config.height}
                </span>
              </div>
              <div
                className="flex justify-between rounded-lg px-2.5 py-1.5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>Max Frames</span>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                  {config.autoMaxFrame ? 'Auto' : config.maxFrame}
                </span>
              </div>
            </div>
          </div>
        )}

        <motion.button
          whileHover={{ background: 'rgba(255,255,255,0.07)' }}
          onClick={reset}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl mt-2"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}
        >
          <RotateCcw size={12} style={{ color: 'rgba(255,255,255,0.35)' }} />
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>Reset</span>
        </motion.button>
      </div>
    </div>
  );
}
