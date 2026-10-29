# VideoAlpha — Architecture, Features & Scaling Plan

> Status: as deployed on `52-64-233-99.nip.io` (AWS `ap-southeast-2b`, instance `t3.small`).
> All numbers in this document were measured from the live host or read from the current code, not estimated,
> unless explicitly marked **(estimate)**.

---

## 1. Executive summary

**Verdict on scaling: the web tier scales fine; the GPU tier does not.** Almost all expensive work
(video generation) already runs off-box on RunPod, so the EC2 box is only a control plane. The real ceilings are:

1. A single `t3.small` (2 vCPU / 2 GB RAM) running two single-process Python services — no horizontal
   scaling, no multi-worker, all job state in process memory.
2. RunPod GPU work is **serialized**: one Pod per model family, one render at a time per Pod, with
   8–15 minute cold starts.
3. A shared 165 GB network volume pinned to one data center (`EUR-IS-2`), which caps GPU choice and
   makes concurrent model families fragile.
4. Polling amplification: every browser tab polls `/api/pod/status` every 2.5–12 s, and each poll costs
   **3 RunPod MCP round trips**.

**Verdict on "new UI on the same instance + keep the current one as legacy": yes, this is low-risk and
straightforward** — it is a routing + static-asset problem, not an architecture problem. Details and the
concrete change set are in §6.

---

## 2. Current architecture

### 2.1 Topology

```
                         ┌────────────────────────────── AWS EC2 · t3.small · ap-southeast-2b ─┐
                         │  2 vCPU · 2 GB RAM · 19 GB disk (11 GB free) · 4 GB swap            │
  Browser ─── HTTPS ───► │  nginx :443 (nip.io cert, client_max_body_size 210M)                │
                         │    ├── /              → /var/www/videoalpha   (React SPA, built)    │
                         │    ├── /api/          → 127.0.0.1:8000        (VideoAlpha FastAPI)  │
                         │    ├── /ltx-app/      → 127.0.0.1:7777        (LTX FastAPI + static)│
                         │    ├── /minimax-app/  → 127.0.0.1:8000/minimax-app/ (mounted sub-app)│
                         │    └── /polly-app/    → 127.0.0.1:8000/polly-app/   (mounted sub-app)│
                         │                                                                      │
                         │  videoalpha-backend.service   uvicorn main:app      :8000  ~82 MB RSS│
                         │  ltx25-frontend.service       uvicorn frontend_app  :7777  ~67 MB RSS│
                         └───────────────┬──────────────────────────────────────┬───────────────┘
                                         │ RunPod MCP (HTTPS, Bearer key)        │ RunPod v2 REST
                                         ▼                                       ▼
                         ┌────────────────────────────┐        ┌──────────────────────────────────┐
                         │ mcp.runpod.io              │        │ Serverless endpoints              │
                         │  list-pods / get-pod       │        │  INFINITETALK_ENDPOINT_ID         │
                         │  create-pod / delete-pod   │        │  WANANIMATE_ENDPOINT_ID           │
                         │  pod-action / stream-logs  │        │  LTX 2.5 endpoint (RUNPOD_ENDPOINT_ID)│
                         └──────────┬─────────────────┘        └──────────────┬───────────────────┘
                                    │ create/terminate                      │ S3 volume (eu-ro-1)
                                    ▼                                       ▼
                         ┌──────────────────────────────────────┐   ┌──────────────────────┐
                         │ RunPod GPU Pods (Secure Cloud)        │   │ RunPod S3 bucket      │
                         │  ltx25-pod        :7777 + :8188      │   │  media in / outputs   │
                         │  minimax-h3-pod   :8188 + :8888      │   └──────────────────────┘
                         │  both mount vkqbtcijow → /workspace  │
                         │  network volume 165 GB @ EUR-IS-2    │
                         └──────────────────────────────────────┘
```

### 2.2 Components

| Component | Location | Process | Responsibility |
|---|---|---|---|
| SPA shell | `/var/www/videoalpha` (React + Vite + Tailwind) | static | Dashboard, Create (InfiniteTalk), Jobs, Architecture, `/ltx`, `/minimax`, `/voices` |
| VideoAlpha backend | `backend/main.py` (FastAPI) | `:8000` | InfiniteTalk + WanAnimate serverless submission, job store, MiniMax & Polly studio mounts |
| LTX service | `~/ltx25` (`LTX2.5-serverless`) | `:7777` | LTX payload builder, Pod lifecycle, serverless submit, Pod proxy + output cache |
| MiniMax studio | `backend/minimax_studio` (mounted at `/minimax-app` **and** `/api/minimax`) | in `:8000` | 14 MiniMax H3 workflows, Pod lifecycle, direct ComfyUI submit, output cache |
| Polly voice studio | `backend/polly_studio` (mounted at `/polly-app` **and** `/api/polly`) | in `:8000` | Amazon Polly TTS (Generative, Neural, Long-Form, Standard), SSML builder, Viseme speech marks, PLS lexicons, S3 async tasks |
| Reverse proxy | nginx | `:80/:443` | TLS, routing, body-size cap, 300–900 s proxy timeouts |
| Control plane | `mcp.runpod.io` | remote | Pod CRUD + logs |
| GPU workers | RunPod Pods / endpoints | remote | ComfyUI render |

### 2.3 Deployment

Git-based, no CI/CD pipeline beyond GitHub:

```
local edit → git push (skyfaiz/VideoAlpha, skyfaiz/LTX2.5-serverless)
           → ssh EC2 → ~/app/deploy.sh  or  ~/ltx25/deploy.sh
             git pull --ff-only → pip install -r requirements.txt → systemctl restart
             → /health check → npm ci + vite build → rsync to /var/www → nginx -t + reload
```

Two separate repos, two separate virtualenvs, two systemd units, one nginx vhost. Secrets live in
`~/app/backend/.env` and `~/ltx25/.env`, injected via systemd `EnvironmentFile=` (added this session —
the units previously did not load `.env`).

### 2.4 Request flows

**InfiniteTalk (serverless)**
`POST /api/infinitetalk/submit` → upload/base64 handling → `InfinitetalkS3Client` → RunPod v2 REST
`/run` → job id stored in `outputs/jobs_history.json` + in-memory `jobs` dict → SPA polls
`/api/infinitetalk/status/{id}` → RunPod `/status/{id}` → output URLs from S3.

**LTX 2.5**
Two modes on the same page: serverless (`/api/submit` → RunPod endpoint) and Pod
(`/api/pod-submit` → Pod's own frontend at `:7777`, or local ComfyUI when running inside the Pod).
The EC2 instance proxies Pod submit/status and caches media into `~/ltx25/outputs`.

**MiniMax H3**
`/minimax-app/api/payload` compiles a LiteGraph workflow → ComfyUI `/prompt` API JSON. Submit uploads
media to the Pod's ComfyUI `/upload/image`, queues at `/prompt`, then polls
`/history/{prompt_id}`; media is fetched via `/view` and cached in `backend/minimax_studio/outputs`.

### 2.5 Pod lifecycle & safety

- Discovery: `list-pods` filtered by name/image (`ltx25-pod`, `comfyui-minimax-template`).
- Deploy: `create-pod` with GPU fallback list, `minCudaVersion 13.0`, network volume `vkqbtcijow` → `/workspace`.
- Start / stop / restart / terminate via `pod-action` and `delete-pod`.
- Readiness: LTX via `:7777/health`, MiniMax via `:8188/system_stats`.
- **Idle watchdog (added this session):** terminates a `RUNNING`+ready Pod when no job arrives for
  `POD_IDLE_TIMEOUT_SECONDS` (default 180 s). Guarded by: bootstrapping state, tracked in-flight jobs,
  ComfyUI `/queue` busy check. Exposes countdown, Pod runtime, and run history (with per-run duration).

---

## 3. Feature inventory

### 3.1 Shell / platform
- Dark, responsive React shell: sidebar + mobile bottom nav, header with notification feed, status bar.
- Pages: Dashboard (real job stats + quick start), Create (InfiniteTalk), Jobs (history, download),
  Architecture (interactive flow diagram), LTX Generation (embedded `/ltx-app/`), MiniMax H3 (embedded `/minimax-app/`).
- Settings drawer (client-side preferences only), job persistence via `localStorage` + backend sync.

### 3.2 InfiniteTalk / WanAnimate (serverless)
- 4 InfiniteTalk workflows (I2V single/multi, V2V single/multi), 2-person audio, `max_frame`, `force_offload`.
- 5 input modes: `upload_s3`, `upload_base64`, `url`, `path`, `base64` — per media/audio field.
- Custom download filename settings, S3-backed outputs, RunPod serverless job polling.

### 3.3 LTX 2.5
- Serverless mode + on-demand Pod mode; payload builder with curated advanced overrides
  (sampler, sigma schedule/steps, CFG, I2V strengths, seed, negative prompt, prompt enhancer, preprocessing, VAE tiling).
- Pod panel: GPU select, deploy/start/stop/terminate, ComfyUI deep link, live boot logs,
  idle countdown, Pod runtime, last-run duration.

### 3.4 MiniMax H3 (14 workflows)
- I2V ×4, T2V ×4, R2V ×2 (multiple picture/video/audio reference slots, limits taken from the upstream graph),
  RefMod ×1, RefMod Studio ×3 (image/video/audio pack builders) — all compiled from upstream LiteGraph JSON to ComfyUI `/prompt` API,
  including subgraph expansion, `SetNode`/`GetNode` resolution, bypassed-node passthrough, and
  quant-profile model swapping (`int8`/`fp8`/`nvfp4`/`bf16`).
- Pod panel: GPU + quant profile select, ComfyUI/Jupyter links, boot logs, idle countdown, runtime,
  run history, RefMod sync from live Pod.

### 3.5 Cross-cutting
- Job/Pod timing published: per-job `completed_at`, `completed_clock`, `duration_seconds`;
  per-Pod `runtime_seconds`, `runtime_display`, `run_history`.
- Output caching on EC2 with path-traversal-safe filename handling.

---

## 4. Scaling analysis

### 4.1 What already scales

| Aspect | Why it scales |
|---|---|
| GPU compute | All generation is on RunPod; EC2 load stays flat as renders increase. |
| Serverless paths | InfiniteTalk/WanAnimate/LTX-serverless autoscale on RunPod; EC2 only proxies. |
| Static SPA | nginx serves a ~525 KB JS bundle + 100 KB CSS; negligible CPU. |
| Idle cost | Watchdog + stop/terminate keep GPU billing tied to actual use. |

### 4.2 Bottlenecks, ranked

| # | Bottleneck | Evidence | Impact |
|---|---|---|---|
| **B1** | Single small node, single-process services | `t3.small`, 2 vCPU, 1.9 GiB RAM, 1.3 GiB available; both uvicorns run **without `--workers`** | Hard ceiling on concurrent requests; no HA; a crash takes both UIs down |
| **B2** | In-process state | `POD_SUBMIT_JOBS`, `POD_ACTIVITY`, `POD_RUN_HISTORY`, `jobs` dict in `routes/infinitetalk.py` | Cannot add workers/replicas without breaking job polling, idle timing, and history |
| **B3** | MCP call amplification | `/api/pod/status` = `list-pods` + `get-pod` + `stream-pod-logs`; SPA polls every 2.5 s (bootstrap) / 12 s (idle) | 3 MCP calls per client per poll; 10 tabs ≈ 30 calls/12 s ≈ 150/min against `mcp.runpod.io` |
| **B4** | Serialized GPU work | One Pod per family; ComfyUI queue is FIFO single-worker | N users queue behind each other; MiniMax 2× upscale renders are long |
| **B5** | Cold-start cost | MiniMax int8 set ≈ 80 GB models; LTX loads full model set at boot | Returning after the 3-min idle timeout pays 8–15 min again — the main UX/cost tension |
| **B6** | Volume pinned to one DC | `vkqbtcijow` @ `EUR-IS-2`; RunPod docs: volume is data-center-scoped, one volume per DC, concurrent writes from multiple workers risk corruption | GPU availability limited to one DC; LTX+MiniMax simultaneous runs share one volume |
| **B7** | Local output cache, no retention | `~/ltx25/outputs` 2.2 MB, `backend/outputs` 6.1 MB today; 11 GB free on `/` | Grows unbounded; disk exhaustion kills nginx + both services |
| **B8** | Uploads through app memory | base64 modes parse whole payloads in RAM; nginx cap 210 MB | A few concurrent large uploads on 2 GB RAM → OOM/swap thrash |
| **B9** | No auth, open CORS | `allow_origins=["*"]`; no API key/token on any route | Anyone with the URL can deploy GPUs (cost) and terminate Pods |
| **B10** | No observability / backups | No metrics, no log shipping, no DB backup; logs only in journald | Failures are diagnosed after the fact; no capacity data |
| **B11** | Single AZ, single instance | `ap-southeast-2b` | AZ event = full outage |

### 4.3 Capacity model (estimates)

| Metric | Today (t3.small, 1 process/svc) | Notes |
|---|---|---|
| Idle RAM | ~600 MB used of 1.9 GiB | ~1.3 GiB headroom |
| Per-service RAM | 67–82 MB RSS | Python + FastAPI |
| Concurrent UI users (comfortable) | ~10–20 | dominated by polling + MCP fan-out, not CPU |
| Concurrent UI users (hard limit) | ~40–60 before MCP throttling/queueing | needs measurement (see Phase 0) |
| Concurrent renders | 1 per Pod per family | serialized by ComfyUI |
| Renders/hour, LTX | ~4–8 (5 s clip, warm Pod) | boot excluded |
| Renders/hour, MiniMax | ~2–6 (5 s clip, int8, warm) | upscale workflows lower |
| Cold start | LTX ~5–8 min, MiniMax ~8–15 min (cold volume) | dominates first job of a session |

> None of these were load-tested. Phase 0 below adds the measurement to replace these estimates with data.

### 4.4 Cost shape

GPU time dominates. At current prices in the UI: L40S $1.09/hr, RTX PRO 6000 MIG $1.29/hr,
RTX PRO 6000 $2.49/hr, H100 $2.69/hr, RTX 5090 $0.89/hr. A 3-minute idle timeout means a user doing
one 5-second render pays roughly (boot + render + 3 min) of GPU time — the boot is usually the largest term.
EC2 `t3.small` (~$15/mo) + 165 GB network volume (~$11.55/mo at $0.07/GB) are rounding errors by comparison.

---

## 5. Where the system is fragile (concrete failure modes)

1. **Two users, two model families** — LTX and MiniMax Pods both mount `vkqbtcijow`; concurrent writes are
   documented as corruption-prone. Today nothing prevents both being deployed at once.
2. **Idle watchdog vs. slow render** — if the browser tab closes mid-render, the EC2 side still tracks the
   job (`POD_SUBMIT_JOBS`) and the `/queue` check protects it; but if the Pod's ComfyUI is unreachable,
   protection relies only on the tracked-job record and its 30-minute max age.
3. **Disk growth** — outputs are never pruned; the 19 GB root volume is the smallest resource in the system.
4. **Restart loses timing state** — `POD_ACTIVITY`/`POD_RUN_HISTORY` are memory-only, so a deploy resets the
   idle countdown and history (safe, but the UI briefly shows "unknown activity").
5. **Unbounded blast radius** — no auth means a leaked URL is a GPU-spend incident.

---

## 6. New UI alongside the current one ("legacy") — feasibility

**Yes. Recommended, and low-risk.** This is a routing and build-config change; no backend rewrite is needed.

### 6.1 Why it works here
- The SPA is a static bundle (525 KB JS / 100 KB CSS) served by nginx — adding a second bundle costs disk only.
- Routing is already path-prefixed per app (`/api/`, `/ltx-app/`, `/minimax-app/`), so a new UI can own
  `/v2/` (or `app2.`) without touching existing paths.
- Backends are already path-agnostic FastAPI apps; the MiniMax studio is even mounted twice
  (`/minimax-app` and `/api/minimax`), proving multi-prefix hosting works.

### 6.2 Two options

| | **Option A — same origin, path prefix (`/v2/`)** | **Option B — separate subdomain (`v2.example.com`)** |
|---|---|---|
| nginx | one vhost, add `location /v2/` | second `server` block + cert |
| Vite | `base: '/v2/'`, router `basename: '/v2'` | default base |
| Cookies/auth | same-origin, simplest | needs CORS/domain cookie config |
| Cache isolation | per-path headers | fully isolated |
| Effort | ~1 h | ~2–3 h (DNS + certbot) |
| Recommendation | **preferred** (matches existing `/ltx-app/` pattern) | use when the new UI gets its own release cadence |

### 6.3 Concrete change set for Option A

1. Build the new app into a separate output dir: `npm run build -- --outDir dist-v2` with
   `base: '/v2/'` in its `vite.config.ts`.
2. Publish: `sudo rsync -a --delete frontend/dist-v2/ /var/www/videoalpha-v2/`.
3. nginx (inside the existing vhost, **before** `location /`):
   ```nginx
   location = /v2 { return 301 /v2/; }
   location /v2/ {
       alias /var/www/videoalpha-v2/;
       try_files $uri $uri/ /v2/index.html;
   }
   ```
4. Keep the legacy UI untouched at `/`; add a "Legacy UI" link in the new shell (and vice versa).
5. `deploy.sh`: build both bundles, publish both, `nginx -t` then reload. Guard with a flag so the legacy
   build can be frozen (`SKIP_LEGACY_BUILD=1`).
6. If the new UI needs its own backend, add a second systemd unit on a new port (e.g. `:8001`) and route
   `/v2/api/` → `127.0.0.1:8001`. Budget ~80–100 MB RAM — acceptable today (1.3 GiB free) but see B1.

### 6.4 Risks to handle
- **SPA fallback collisions**: `try_files` must point at the v2 index, not `/index.html`.
- **Router basename**: React Router needs `basename="/v2"` or every deep link 404s.
- **Asset caching**: set `Cache-Control: no-store` on `/v2/index.html`, long max-age on hashed assets.
- **Shared API contracts**: if both UIs call the same `/api/`, version the contract before changing it.
- **RAM headroom**: don't add a third Python service on `t3.small` without resizing (see Phase 1).

---

## 7. Scaling plan

Ordered by value per unit of effort. Each phase has an exit criterion so progress is measurable.

### Phase 0 — Measure & harden (days, no resize) ✅ highest ROI
1. Add lightweight metrics: request counts/latency per route, MCP call counts, Pod uptime minutes, render
   durations, error rates (Prometheus text endpoint or structured logs → CloudWatch).
2. Load-test the control plane (e.g. `k6`/`ab`) at 10/25/50 concurrent pollers to get real MCP limits.
3. **Cache Pod status server-side** (single-flight, 3–5 s TTL) — collapses B3 by ~10–30× with no infra change.
4. **Auth**: shared bearer token or signed session for mutating routes (`/api/pod/*`, `/api/minimax/api/pod/*`);
   restrict CORS to the real origin.
5. **Output retention**: prune cached media by age/size (e.g. 7 days, 2 GB cap) with a systemd timer.
6. **Guard the volume**: refuse to deploy the second Pod family while one is running on `vkqbtcijow`
   (or require an explicit override), since concurrent writes risk corruption.
7. Backups: snapshot `jobs_history.json` and `.env` off-box.

**Exit:** documented p95 latency + MCP call rate at 25 concurrent users; auth on mutating routes; no unbounded disk growth.

### Phase 1 — Decouple the web tier (1–2 weeks)
1. Move state out of process: Redis (or Postgres) for jobs, `POD_ACTIVITY`, `POD_RUN_HISTORY`.
   Then run uvicorn with `--workers 2–4` and/or two instances behind an ALB.
2. Split services properly: `videoalpha-api`, `minimax-api`, `ltx-api` as separate units (or containers),
   each independently restartable.
3. Resize to `t3.medium` (4 GB) or `t3.large` (8 GB) — or better, move to ECS/Fargate so RAM is not hand-tuned.
4. Stream large uploads to S3 instead of base64-in-RAM (B8); raise/limit `client_max_body_size` deliberately.
5. Put the idle watchdog behind a leader lock (Redis `SETNX`) so replicas cannot double-terminate.

**Exit:** two API replicas serve traffic with shared state; rolling deploy without dropping polls.

### Phase 2 — Make the GPU tier a queue, not a singleton (2–4 weeks)
1. Introduce a job queue (SQS/Redis) + a Pod-orchestrator worker: submit → queue → assign to a Pod →
   poll ComfyUI → publish result. Removes browser-driven polling from the critical path.
2. Replace per-client polling with **SSE/WebSocket** push from the orchestrator (also removes B3 entirely).
3. Pod pool policy: warm Pod for the hot model, scale-to-zero for the cold one; tune idle timeout per family
   (MiniMax longer, LTX shorter) since boot cost differs.
4. Volume strategy: add a second network volume in another DC and mirror models (docs: one volume per DC,
   no auto-sync), or move models to a **global volume** so Pods are not pinned to `EUR-IS-2`.
5. Per-user quotas and concurrency caps (max 1 active Pod per user, queue position display).

**Exit:** 5+ concurrent users queue transparently; no render lost to a closed tab; GPU spend attributable per user.

### Phase 3 — Multi-region / HA (ongoing)
1. ALB + Auto Scaling Group (min 2, multi-AZ) or ECS service; move TLS to ACM.
2. CloudWatch dashboards + alarms (5xx rate, MCP error rate, disk %, Pod minutes/day, cost/day).
3. Prefer serverless endpoints for bursty traffic (they already autoscale) and Pods for long interactive sessions.
4. Add per-family cost reporting (GPU-minutes × price) so the idle-timeout tradeoff is tuned with data.

**Exit:** AZ failure survivable; cost per render tracked and trending down.

---

## 8. Decisions needed from you

1. **Idle timeout policy** — keep a single 180 s default, or per-family (e.g. LTX 180 s, MiniMax 600 s) given
   MiniMax's longer cold start?
2. **Concurrent Pod families** — allow LTX + MiniMax Pods simultaneously on the shared volume (risk of write
   contention) or enforce one at a time?
3. **New UI shape** — Option A (`/v2/`, same origin) vs Option B (subdomain)? And does it get its own backend?
4. **Auth model** — single shared token vs per-user accounts (affects Phase 1/2 design).
5. **Where state should live** — Redis (simple, fast) vs Postgres (durable, queryable) for jobs and run history.

---

## 9. Appendix — measured environment

| Item | Value |
|---|---|
| Instance | `t3.small`, `ap-southeast-2b`, up 1 day |
| CPU / RAM | 2 vCPU / 1.9 GiB (599 MiB used, 1.3 GiB available, 4 GiB swap) |
| Disk | `/dev/root` 19 G, 7.9 G used, 11 G free (43%) |
| Load average | 0.03 / 0.03 / 0.00 |
| Services | nginx (2 workers), videoalpha-backend `:8000` (82 MB), ltx25-frontend `:7777` (67 MB) |
| Not installed | Docker, Redis, Postgres |
| Output caches | `~/app/backend/outputs` 6.1 MB, `~/ltx25/outputs` 2.2 MB, minimax 4 KB |
| SPA build | 524 KB JS (162 KB gzip) + 100 KB CSS (16 KB gzip) |
| Pod volume | `vkqbtcijow` = `ltx25-models`, 165 GB, `EUR-IS-2` → `/workspace` |
| Pod images | LTX `notrius/ltx-2.5-serverless:cu130`; MiniMax `hearmeman/comfyui-minimax-template:v10` |
| RunPod key source | systemd `EnvironmentFile` (`~/app/backend/.env`, `~/ltx25/.env`); local dev falls back to `.devin/mcp_config*.json` |
