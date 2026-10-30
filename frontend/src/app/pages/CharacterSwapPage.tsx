import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, X, Image as ImageIcon, Film, Link2, Sparkles, Check,
  Download, RefreshCw, AlertCircle, Loader, Play, Replace, Server,
} from 'lucide-react';
import {
  getCharacterSwapNodes,
  submitCharacterSwapJob,
  getCharacterSwapStatus,
  getCharacterSwapDownloadUrl,
  saveJob,
  updateJobStatus,
  mapBackendStatus,
  type AppNode,
} from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type MediaMode = 'upload' | 'url';

interface MediaState {
  mode: MediaMode;
  file: File | null;
  previewUrl: string;
  url: string;
}

const emptyMedia = (): MediaState => ({ mode: 'upload', file: null, previewUrl: '', url: '' });

const ACCENT = '#F59E0B';
const ACCENT_SOFT = 'rgba(245,158,11,0.14)';

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

const FILE_TYPES = new Set(['IMAGE', 'VIDEO', 'AUDIO']);

// ─── Media picker (upload or URL) ─────────────────────────────────────────────
function MediaPicker({
  state,
  onChange,
  kind,
  label,
  hint,
}: {
  state: MediaState;
  onChange: (s: MediaState) => void;
  kind: 'image' | 'video';
  label: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const setFile = (file: File | null) => {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    onChange({ ...state, file, previewUrl: file ? URL.createObjectURL(file) : '' });
  };

  return (
    <div
      className="rounded-2xl p-4 flex-1 min-w-0"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {kind === 'image' ? <ImageIcon size={14} style={{ color: ACCENT }} /> : <Film size={14} style={{ color: ACCENT }} />}
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>{label}</span>
        </div>
        <div className="flex gap-1">
          {(['upload', 'url'] as MediaMode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...state, mode: m })}
              className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{
                background: state.mode === m ? ACCENT_SOFT : 'rgba(255,255,255,0.04)',
                border: `1px solid ${state.mode === m ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.08)'}`,
                cursor: 'pointer',
              }}
            >
              {m === 'upload' ? (
                <Upload size={10} style={{ color: state.mode === m ? ACCENT : 'rgba(255,255,255,0.4)' }} />
              ) : (
                <Link2 size={10} style={{ color: state.mode === m ? ACCENT : 'rgba(255,255,255,0.4)' }} />
              )}
              <span style={{ fontSize: '10px', color: state.mode === m ? ACCENT : 'rgba(255,255,255,0.5)' }}>
                {m === 'upload' ? 'Upload' : 'URL'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {state.mode === 'upload' ? (
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
                borderColor: dragging ? ACCENT : 'rgba(255,255,255,0.1)',
                background: dragging ? ACCENT_SOFT : 'rgba(255,255,255,0.02)',
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
              style={{ border: '2px dashed rgba(255,255,255,0.1)', minHeight: 120 }}
            >
              <Upload size={18} style={{ color: dragging ? ACCENT : 'rgba(255,255,255,0.4)', marginBottom: 6 }} />
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                Tap or drop {kind} file
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                {hint || (kind === 'image' ? 'JPG, PNG, WebP · ≤30MB' : 'MP4, MOV · >30MB goes via S3 URL')}
              </div>
            </motion.div>
          ) : (
            <div
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: ACCENT_SOFT, border: '1px solid rgba(245,158,11,0.25)' }}
            >
              {kind === 'image' ? (
                <img src={state.previewUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
              ) : (
                <video src={state.previewUrl} style={{ width: 56, height: 40, borderRadius: 8, objectFit: 'cover', background: '#000' }} muted />
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate" style={{ fontSize: '11px', color: '#F8FAFC' }}>{state.file.name}</div>
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
      ) : (
        <input
          type="text"
          value={state.url}
          onChange={e => onChange({ ...state, url: e.target.value })}
          placeholder={kind === 'image' ? 'https://example.com/character.png' : 'https://example.com/source.mp4'}
          style={textInputStyle}
        />
      )}
    </div>
  );
}

// ─── Node param field ─────────────────────────────────────────────────────────
function NodeParamField({
  node,
  value,
  dirty,
  onChange,
}: {
  node: AppNode;
  value: string;
  dirty: boolean;
  onChange: (v: string) => void;
}) {
  const label = node.description || `${node.nodeName || 'Node'} ${node.nodeId} · ${node.fieldName}`;
  const options: any[] = Array.isArray(node.fieldData) ? node.fieldData : [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ fontSize: '11px', fontWeight: 600, color: dirty ? ACCENT : 'rgba(255,255,255,0.55)' }}>
          {label}
        </span>
        <span
          style={{
            fontSize: '9px',
            padding: '1px 6px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.35)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {node.fieldType} · #{node.nodeId}.{node.fieldName}
        </span>
      </div>
      {node.fieldType === 'LIST' && options.length > 0 ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...textInputStyle, cursor: 'pointer' }}
        >
          {options.map((o, i) => {
            const opt = typeof o === 'object' && o !== null ? String(o.value ?? o.label ?? JSON.stringify(o)) : String(o);
            const optLabel = typeof o === 'object' && o !== null ? String(o.label ?? o.value ?? opt) : opt;
            return (
              <option key={i} value={opt} style={{ background: '#0F172A' }}>
                {optLabel}
              </option>
            );
          })}
        </select>
      ) : node.fieldType === 'STRING' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={2}
          style={{ ...textInputStyle, resize: 'vertical' }}
        />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} style={textInputStyle} />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function CharacterSwapPage() {
  const [image, setImage] = useState<MediaState>(emptyMedia());
  const [video, setVideo] = useState<MediaState>(emptyMedia());
  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [nodesLoading, setNodesLoading] = useState(true);
  const [appId, setAppId] = useState('');
  const [imageNodeKey, setImageNodeKey] = useState('');
  const [videoNodeKey, setVideoNodeKey] = useState('');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [instanceType, setInstanceType] = useState('default');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const imageNodes = nodes.filter(n => String(n.fieldType).toUpperCase() === 'IMAGE');
  const videoNodes = nodes.filter(n => String(n.fieldType).toUpperCase() === 'VIDEO');
  const paramNodes = nodes.filter(n => !FILE_TYPES.has(String(n.fieldType).toUpperCase()));

  const loadNodes = useCallback(async () => {
    setNodesLoading(true);
    setNodesError(null);
    try {
      const res = await getCharacterSwapNodes();
      setAppId(res.app_id);
      setNodes(res.nodes);
      const init: Record<string, string> = {};
      for (const n of res.nodes) {
        init[`${n.nodeId}.${n.fieldName}`] = n.fieldValue == null ? '' : String(n.fieldValue);
      }
      setParamValues(init);
      const firstImage = res.nodes.find(n => String(n.fieldType).toUpperCase() === 'IMAGE');
      const firstVideo = res.nodes.find(n => String(n.fieldType).toUpperCase() === 'VIDEO');
      setImageNodeKey(firstImage ? `${firstImage.nodeId}|${firstImage.fieldName}` : '');
      setVideoNodeKey(firstVideo ? `${firstVideo.nodeId}|${firstVideo.fieldName}` : '');
    } catch (e: any) {
      setNodesError(e?.response?.data?.detail || e?.message || 'Failed to load app parameters');
    } finally {
      setNodesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  // Poll active job
  useEffect(() => {
    if (!jobId || jobStatus === 'COMPLETED' || jobStatus === 'FAILED') return;
    const interval = setInterval(async () => {
      try {
        const st = await getCharacterSwapStatus(jobId);
        setJobStatus(st.status);
        setJobError(st.error);
        updateJobStatus(jobId, {
          status: mapBackendStatus(st.status),
          progress: st.status === 'COMPLETED' ? 100 : 60,
          size: (st as any).size ?? undefined,
          error: st.error ?? undefined,
          completedAt: st.completed_at ?? undefined,
        });
      } catch {
        // transient poll errors are ignored
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  const dirtyOverrides = paramNodes
    .filter(n => {
      const key = `${n.nodeId}.${n.fieldName}`;
      const initial = n.fieldValue == null ? '' : String(n.fieldValue);
      return paramValues[key] !== undefined && paramValues[key] !== initial;
    })
    .map(n => ({
      nodeId: n.nodeId,
      fieldName: n.fieldName,
      fieldValue: paramValues[`${n.nodeId}.${n.fieldName}`],
    }));

  const canSubmit =
    !submitting &&
    (image.mode === 'upload' ? !!image.file : !!image.url.trim()) &&
    (video.mode === 'upload' ? !!video.file : !!video.url.trim());

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setJobError(null);
    try {
      const fd = new FormData();
      if (image.mode === 'upload' && image.file) fd.append('image', image.file);
      else fd.append('image_url', image.url.trim());
      if (video.mode === 'upload' && video.file) fd.append('video', video.file);
      else fd.append('video_url', video.url.trim());
      fd.append('instance_type', instanceType);
      if (imageNodeKey) {
        const [nid, fname] = imageNodeKey.split('|');
        fd.append('image_node_id', nid);
        fd.append('image_field_name', fname);
      }
      if (videoNodeKey) {
        const [nid, fname] = videoNodeKey.split('|');
        fd.append('video_node_id', nid);
        fd.append('video_field_name', fname);
      }
      if (dirtyOverrides.length) fd.append('node_overrides', JSON.stringify(dirtyOverrides));

      const res = await submitCharacterSwapJob(fd);
      setJobId(res.job_id);
      setJobStatus('IN_QUEUE');
      saveJob({
        id: res.job_id,
        backend: 'characterswap',
        type: 'Character Swap',
        name: image.file?.name || image.url || 'character',
        status: 'queued',
        progress: 10,
        createdAt: new Date().toISOString(),
      });
    } catch (e: any) {
      setJobError(e?.response?.data?.detail || e?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadUrl = jobId && jobStatus === 'COMPLETED' ? getCharacterSwapDownloadUrl(jobId) : null;

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
    >
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: ACCENT_SOFT, border: '1px solid rgba(245,158,11,0.35)' }}
            >
              <Replace size={16} style={{ color: ACCENT }} />
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }}>
                Character Swap
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
                RunningHub · Long video unlimited duration character replacement
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {appId && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '3px 9px',
                  borderRadius: 20,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'monospace',
                }}
              >
                app {appId}
              </span>
            )}
            <button
              type="button"
              onClick={loadNodes}
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
              }}
              title="Reload app parameters"
            >
              <RefreshCw size={13} className={nodesLoading ? 'animate-spin' : ''} style={{ color: 'rgba(255,255,255,0.5)' }} />
            </button>
          </div>
        </div>

        {/* Node load error */}
        {nodesError && (
          <div
            className="flex items-start gap-2.5 rounded-2xl p-3.5"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <AlertCircle size={15} style={{ color: '#F87171', flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#FCA5A5' }}>{nodesError}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
                Set <code style={{ color: '#FBBF24' }}>RUNNINGHUB_API_KEY</code> in backend/.env, then retry.
              </div>
            </div>
          </div>
        )}

        {/* Inputs */}
        <div className="flex flex-col sm:flex-row gap-3">
          <MediaPicker state={image} onChange={setImage} kind="image" label="Character Image" hint="The face/character to insert" />
          <MediaPicker state={video} onChange={setVideo} kind="video" label="Source Video" hint="The video whose character gets replaced" />
        </div>

        {/* Node mapping */}
        {nodes.length > 0 && (imageNodes.length + videoNodes.length) > 0 && (
          <div
            className="rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {imageNodes.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                  Character image → node
                </div>
                <select value={imageNodeKey} onChange={e => setImageNodeKey(e.target.value)} style={{ ...textInputStyle, cursor: 'pointer' }}>
                  {imageNodes.map((n, i) => (
                    <option key={i} value={`${n.nodeId}|${n.fieldName}`} style={{ background: '#0F172A' }}>
                      #{n.nodeId} {n.nodeName} · {n.description || n.fieldName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {videoNodes.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                  Source video → node
                </div>
                <select value={videoNodeKey} onChange={e => setVideoNodeKey(e.target.value)} style={{ ...textInputStyle, cursor: 'pointer' }}>
                  {videoNodes.map((n, i) => (
                    <option key={i} value={`${n.nodeId}|${n.fieldName}`} style={{ background: '#0F172A' }}>
                      #{n.nodeId} {n.nodeName} · {n.description || n.fieldName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* App parameters */}
        {paramNodes.length > 0 && (
          <div
            className="rounded-2xl p-4 space-y-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={13} style={{ color: ACCENT }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>App Parameters</span>
              {dirtyOverrides.length > 0 && (
                <span style={{ fontSize: '10px', color: ACCENT }}>{dirtyOverrides.length} modified</span>
              )}
            </div>
            {paramNodes.map(n => {
              const key = `${n.nodeId}.${n.fieldName}`;
              const initial = n.fieldValue == null ? '' : String(n.fieldValue);
              return (
                <NodeParamField
                  key={key}
                  node={n}
                  value={paramValues[key] ?? ''}
                  dirty={(paramValues[key] ?? '') !== initial}
                  onChange={v => setParamValues(prev => ({ ...prev, [key]: v }))}
                />
              );
            })}
          </div>
        )}

        {/* Instance + submit */}
        <div
          className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2 flex-1">
            <Server size={13} style={{ color: 'rgba(255,255,255,0.4)' }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Instance</span>
            <select
              value={instanceType}
              onChange={e => setInstanceType(e.target.value)}
              style={{ ...textInputStyle, width: 'auto', cursor: 'pointer' }}
            >
              <option value="default" style={{ background: '#0F172A' }}>default · 24G VRAM</option>
              <option value="plus" style={{ background: '#0F172A' }}>plus · 48G VRAM</option>
              <option value="ultra" style={{ background: '#0F172A' }}>ultra · 84G VRAM</option>
            </select>
          </div>
          <motion.button
            whileHover={canSubmit ? { scale: 1.02 } : {}}
            whileTap={canSubmit ? { scale: 0.98 } : {}}
            onClick={handleSubmit}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl w-full sm:w-auto"
            style={{
              background: canSubmit ? 'linear-gradient(135deg, #F59E0B, #EF4444)' : 'rgba(255,255,255,0.06)',
              border: 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            {submitting ? <Loader size={14} className="animate-spin text-white" /> : <Play size={14} className="text-white" />}
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
              {submitting ? 'Submitting…' : 'Run Character Swap'}
            </span>
          </motion.button>
        </div>

        {/* Job status */}
        <AnimatePresence>
          {jobId && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  {jobStatus === 'COMPLETED' ? (
                    <Check size={15} style={{ color: '#22C55E' }} />
                  ) : jobStatus === 'FAILED' ? (
                    <AlertCircle size={15} style={{ color: '#EF4444' }} />
                  ) : (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}>
                      <Loader size={15} style={{ color: ACCENT }} />
                    </motion.div>
                  )}
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#E2E8F0' }}>
                      Job #{jobId.slice(0, 8)} · {jobStatus}
                    </div>
                    {jobError && <div style={{ fontSize: '11px', color: '#FCA5A5', marginTop: 2 }}>{jobError}</div>}
                  </div>
                </div>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl"
                    style={{
                      background: 'rgba(139,92,246,0.16)',
                      border: '1px solid rgba(139,92,246,0.35)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#C4B5FD',
                      textDecoration: 'none',
                    }}
                  >
                    <Download size={13} /> Download
                  </a>
                )}
              </div>
              {downloadUrl && (
                <div className="mt-3 rounded-xl overflow-hidden" style={{ background: '#000', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <video src={downloadUrl} controls style={{ width: '100%', maxHeight: 420, display: 'block' }} />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
