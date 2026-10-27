from __future__ import annotations

import copy
import json
import math
import random
import re
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent
CATALOG_PATH = ROOT_DIR / "catalog.json"
TEMPLATE_PATH = ROOT_DIR / "template.json"
REGISTRY_PATH = ROOT_DIR / "src" / "models_registry.json"

FPS = 24
SECONDS_MIN = 1.0
SECONDS_MAX = 15.0
SECONDS_STEP = 1.0

ASPECT_RATIO_SPECS: dict[str, dict[str, Any]] = {
    "9:16": {
        "comfy_label": "9:16 (Portrait Widescreen)",
        "ratio": (9, 16),
    },
    "16:9": {
        "comfy_label": "16:9 (Widescreen)",
        "ratio": (16, 9),
    },
    "1:1": {
        "comfy_label": "1:1 (Square)",
        "ratio": (1, 1),
    },
    "2:3": {
        "comfy_label": "2:3 (Portrait Photo)",
        "ratio": (2, 3),
    },
    "3:2": {
        "comfy_label": "3:2 (Photo)",
        "ratio": (3, 2),
    },
    "3:4": {
        "comfy_label": "3:4 (Portrait Standard)",
        "ratio": (3, 4),
    },
    "4:3": {
        "comfy_label": "4:3 (Standard)",
        "ratio": (4, 3),
    },
    "21:9": {
        "comfy_label": "21:9 (Ultrawide)",
        "ratio": (21, 9),
    },
}

COMFY_LABEL_TO_SHORT_AR = {
    spec["comfy_label"]: short_key for short_key, spec in ASPECT_RATIO_SPECS.items()
}


def compute_resolution(
    aspect_key: str, megapixels: float = 0.7, multiple: int = 32
) -> dict[str, int]:
    spec = ASPECT_RATIO_SPECS.get(aspect_key) or ASPECT_RATIO_SPECS["9:16"]
    rw, rh = spec["ratio"]
    total_px = max(0.1, float(megapixels)) * 1_000_000.0
    mult = max(8, int(multiple))
    width = int(round(math.sqrt(total_px * rw / rh) / mult) * mult)
    height = int(round(math.sqrt(total_px * rh / rw) / mult) * mult)
    return {"width": max(mult, width), "height": max(mult, height)}


ASPECT_RATIOS: dict[str, dict[str, int]] = {
    key: compute_resolution(key, 0.7, 32) for key in ASPECT_RATIO_SPECS
}

SAMPLER_OPTIONS = [
    "euler",
    "res_multistep",
    "euler_ancestral",
    "heun",
    "dpm_2",
    "dpm_2_ancestral",
    "uni_pc",
    "uni_pc_bh2",
    "lcm",
    "ddim",
]

SCHEDULER_OPTIONS = [
    "simple",
    "normal",
    "karras",
    "exponential",
    "sgm_uniform",
    "ddim_uniform",
    "beta",
]

TURBO_LORA_OPTIONS = [
    "minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors",
    "minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors",
    "minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors",
    "minimax_h3_hyperflow_8step_v1.0_comfyui_pruned_bf16.safetensors",
]

QUANT_PROFILES = ["int8", "fp8", "nvfp4", "bf16"]

UI_ONLY_NODE_TYPES = {"Note", "MarkdownNote", "SetNode", "GetNode"}

UI_ONLY_WIDGET_KEYS: dict[str, set[str]] = {
    "*": {
        "control_after_generate",
        "upload",
        "audioUI",
        "videopreview",
        "preview",
        "mmrp_block",
        "divider",
        "PowerLoraLoaderHeaderWidget",
        "➕ Add Lora",
        "Refresh RefMods",
        "RefMod library",
    },
    "MiniMaxH3RefModApply": {"fixed"},
}

with CATALOG_PATH.open("r", encoding="utf-8") as _f:
    CATALOG_DATA = json.load(_f)

with TEMPLATE_PATH.open("r", encoding="utf-8") as _f:
    TEMPLATE_DATA = json.load(_f)

with REGISTRY_PATH.open("r", encoding="utf-8") as _f:
    MODELS_REGISTRY = json.load(_f)

WORKFLOW_DOCS: dict[str, dict[str, Any]] = {}
WORKFLOW_META_BY_ID: dict[str, dict[str, Any]] = {}

for _wf in CATALOG_DATA.get("workflows", []):
    _wf_id = _wf["id"]
    _wf_path = ROOT_DIR / _wf["file"]
    with _wf_path.open("r", encoding="utf-8") as _wf_file:
        WORKFLOW_DOCS[_wf_id] = json.load(_wf_file)
    WORKFLOW_META_BY_ID[_wf_id] = _wf

DEFAULT_WORKFLOW_ID = "minimax-h3-image-to-video"


def classify_workflow(wf_id: str, wf_meta: dict[str, Any]) -> dict[str, Any]:
    file_path = wf_meta.get("file", "")
    is_upscale = "Upscaling/" in file_path or wf_id.endswith("-upscale")
    is_auto_prompt = "auto-prompt" in wf_id
    is_refmod_studio = "RefMod Studio/" in file_path

    if is_refmod_studio:
        category = "refmod_studio"
        if "image" in wf_id:
            studio_kind = "image"
        elif "video" in wf_id:
            studio_kind = "video"
        else:
            studio_kind = "audio"
    elif wf_id == "minimax-h3-refmod":
        category = "refmod"
        studio_kind = ""
    elif "reference-to-video" in wf_id:
        category = "r2v"
        studio_kind = ""
    elif "image-to-video" in wf_id:
        category = "i2v"
        studio_kind = ""
    else:
        category = "t2v"
        studio_kind = ""

    return {
        "category": category,
        "studio_kind": studio_kind,
        "is_upscale": is_upscale,
        "is_auto_prompt": is_auto_prompt,
        "is_refmod_studio": is_refmod_studio,
        "requires_prompt": not is_refmod_studio,
        "requires_image": category == "i2v",
        "requires_references": category == "r2v",
        "requires_refmods": category == "refmod",
        "requires_openrouter_key": is_auto_prompt,
    }


def seconds_to_frames(seconds: float) -> int:
    if seconds < SECONDS_MIN or seconds > SECONDS_MAX:
        raise ValueError(
            f"Duration must be between {SECONDS_MIN:g} and {SECONDS_MAX:g} seconds."
        )
    raw = max(5, round(float(seconds) * FPS))
    return int(raw + (5 - (raw % 17)) % 17)


def sanitize_filename(name: str, fallback: str = "input.png") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", (name or "").strip())
    cleaned = cleaned.strip("._")
    return cleaned or fallback


def build_quant_swaps(quant_profile: str = "int8") -> dict[str, str]:
    profile_key = (quant_profile or "int8").strip().lower()
    swaps: dict[str, str] = {}
    for group in TEMPLATE_DATA.get("swap_groups", []):
        profiles = group.get("profiles", {})
        selected = profiles.get(profile_key) or profiles.get(group.get("default", "int8")) or {}
        for prof in profiles.values():
            for role, fname in prof.items():
                if role in selected and fname != selected[role]:
                    swaps[fname] = selected[role]
    return swaps


def apply_quant_swaps_to_doc(doc: dict[str, Any], quant_profile: str = "int8") -> None:
    swaps = build_quant_swaps(quant_profile)
    if not swaps:
        return
    node_groups = [doc.get("nodes", [])] + [
        sg.get("nodes", [])
        for sg in (doc.get("definitions") or {}).get("subgraphs", [])
    ]
    for group in node_groups:
        for node in group:
            wv = node.get("widgets_values")
            if isinstance(wv, list):
                node["widgets_values"] = [
                    swaps.get(v, v) if isinstance(v, str) else v for v in wv
                ]
            wvn = node.get("widgets_values_named")
            if isinstance(wvn, dict):
                for k, v in list(wvn.items()):
                    if isinstance(v, str) and v in swaps:
                        wvn[k] = swaps[v]


def _normalize_link(raw_link: Any) -> tuple[int, int, int, int, int, str]:
    if isinstance(raw_link, dict):
        return (
            int(raw_link["id"]),
            int(raw_link["origin_id"]),
            int(raw_link["origin_slot"]),
            int(raw_link["target_id"]),
            int(raw_link["target_slot"]),
            str(raw_link.get("type", "*")),
        )
    return (
        int(raw_link[0]),
        int(raw_link[1]),
        int(raw_link[2]),
        int(raw_link[3]),
        int(raw_link[4]),
        str(raw_link[5]),
    )


def _clean_widget_inputs(node_type: str, wvn: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(wvn, dict):
        return {}
    skip = UI_ONLY_WIDGET_KEYS["*"] | UI_ONLY_WIDGET_KEYS.get(node_type, set())
    cleaned: dict[str, Any] = {}
    for k, v in wvn.items():
        if k in skip or v is None:
            continue
        cleaned[k] = copy.deepcopy(v)
    return cleaned


def compile_litegraph_to_api(
    doc_in: dict[str, Any], quant_profile: str = "int8"
) -> dict[str, dict[str, Any]]:
    """Compile a ComfyUI LiteGraph JSON (including subgraphs, Set/Get nodes, and
    bypassed mode=4 nodes) into a flat `/prompt` API dictionary."""
    doc = copy.deepcopy(doc_in)
    apply_quant_swaps_to_doc(doc, quant_profile=quant_profile)

    subgraphs_by_id: dict[str, dict[str, Any]] = {
        sg["id"]: sg
        for sg in (doc.get("definitions") or {}).get("subgraphs", [])
        if isinstance(sg, dict) and sg.get("id")
    }

    top_nodes: dict[int, dict[str, Any]] = {
        int(n["id"]): n for n in doc.get("nodes", [])
    }
    top_links: dict[int, tuple[int, int, int, int, int, str]] = {
        link[0]: link
        for link in (_normalize_link(r) for r in doc.get("links", []))
    }

    # Map SetNode constants -> upstream link id
    set_vars: dict[str, int] = {}
    for node in top_nodes.values():
        if node.get("type") == "SetNode":
            const_name = (node.get("widgets_values_named") or {}).get("Constant")
            inputs = node.get("inputs") or []
            if const_name and inputs and inputs[0].get("link") is not None:
                set_vars[str(const_name)] = int(inputs[0]["link"])

    # Pre-index subgraph inner nodes and links for each subgraph instance node
    sg_instances: dict[int, dict[str, Any]] = {}
    for node_id, node in top_nodes.items():
        ntype = str(node.get("type", ""))
        if ntype in subgraphs_by_id:
            sg_def = copy.deepcopy(subgraphs_by_id[ntype])
            sg_nodes = {int(n["id"]): n for n in sg_def.get("nodes", [])}
            sg_links = {
                link[0]: link
                for link in (_normalize_link(r) for r in sg_def.get("links", []))
            }
            # Output slot on -20 -> inner link id
            out_slot_to_link: dict[int, int] = {}
            for lid, lk in sg_links.items():
                if lk[3] == -20:
                    out_slot_to_link[lk[4]] = lid
            sg_instances[node_id] = {
                "def": sg_def,
                "nodes": sg_nodes,
                "links": sg_links,
                "out_slot_to_link": out_slot_to_link,
                "outer_node": node,
            }

    def resolve_top_link(link_id: int, depth: int = 0) -> tuple[str, int] | Any:
        if depth > 40:
            raise ValueError("Circular link detected in workflow graph.")
        link = top_links.get(link_id)
        if not link:
            return None
        _, origin_id, origin_slot, _, _, _ = link
        origin_node = top_nodes.get(origin_id)
        if not origin_node:
            return None

        origin_type = str(origin_node.get("type", ""))

        # Virtual GetNode -> follow SetNode's input link
        if origin_type == "GetNode":
            const_name = str(
                (origin_node.get("widgets_values_named") or {}).get("Constant", "")
            )
            upstream_link_id = set_vars.get(const_name)
            if upstream_link_id is None:
                return None
            return resolve_top_link(upstream_link_id, depth + 1)

        # Subgraph instance output -> follow subgraph's -20 output boundary link
        if origin_id in sg_instances:
            sg_inst = sg_instances[origin_id]
            inner_link_id = sg_inst["out_slot_to_link"].get(origin_slot)
            if inner_link_id is None:
                return None
            return resolve_sg_link(origin_id, inner_link_id, depth + 1)

        # Bypassed node (mode == 4) -> pass through matching input link
        if int(origin_node.get("mode", 0)) == 4:
            in_sockets = origin_node.get("inputs") or []
            if origin_slot < len(in_sockets) and in_sockets[origin_slot].get("link") is not None:
                return resolve_top_link(int(in_sockets[origin_slot]["link"]), depth + 1)
            for sock in in_sockets:
                if sock.get("link") is not None:
                    return resolve_top_link(int(sock["link"]), depth + 1)
            return None

        return [str(origin_id), int(origin_slot)]

    def resolve_sg_link(
        outer_id: int, inner_link_id: int, depth: int = 0
    ) -> list[Any] | Any:
        if depth > 40:
            raise ValueError("Circular subgraph link detected.")
        sg_inst = sg_instances[outer_id]
        link = sg_inst["links"].get(inner_link_id)
        if not link:
            return None
        _, origin_id, origin_slot, _, _, _ = link

        # Boundary input from outer node (-10)
        if origin_id == -10:
            outer_node = sg_inst["outer_node"]
            outer_inputs = outer_node.get("inputs") or []
            if origin_slot < len(outer_inputs):
                outer_sock = outer_inputs[origin_slot]
                if outer_sock.get("link") is not None:
                    return resolve_top_link(int(outer_sock["link"]), depth + 1)
                sock_name = outer_sock.get("name", "")
                outer_wvn = outer_node.get("widgets_values_named") or {}
                if sock_name in outer_wvn:
                    return copy.deepcopy(outer_wvn[sock_name])
            return None

        inner_node = sg_inst["nodes"].get(origin_id)
        if not inner_node:
            return None

        if int(inner_node.get("mode", 0)) == 4:
            in_sockets = inner_node.get("inputs") or []
            if origin_slot < len(in_sockets) and in_sockets[origin_slot].get("link") is not None:
                return resolve_sg_link(
                    outer_id, int(in_sockets[origin_slot]["link"]), depth + 1
                )
            for sock in in_sockets:
                if sock.get("link") is not None:
                    return resolve_sg_link(outer_id, int(sock["link"]), depth + 1)
            return None

        return [f"{outer_id}:{origin_id}", int(origin_slot)]

    api_prompt: dict[str, dict[str, Any]] = {}

    for node_id, node in top_nodes.items():
        ntype = str(node.get("type", ""))
        mode = int(node.get("mode", 0))
        if ntype in UI_ONLY_NODE_TYPES or mode in (2, 4):
            continue

        if node_id in sg_instances:
            sg_inst = sg_instances[node_id]
            for inner_id, inner_node in sg_inst["nodes"].items():
                inner_type = str(inner_node.get("type", ""))
                inner_mode = int(inner_node.get("mode", 0))
                if inner_type in UI_ONLY_NODE_TYPES or inner_mode in (2, 4):
                    continue
                inputs = _clean_widget_inputs(
                    inner_type, inner_node.get("widgets_values_named")
                )
                for sock in inner_node.get("inputs") or []:
                    if sock.get("link") is not None:
                        resolved = resolve_sg_link(node_id, int(sock["link"]))
                        if resolved is not None:
                            inputs[sock["name"]] = resolved
                api_id = f"{node_id}:{inner_id}"
                title = inner_node.get("title") or inner_type
                api_prompt[api_id] = {
                    "class_type": inner_type,
                    "_meta": {"title": title},
                    "inputs": inputs,
                }
            continue

        inputs = _clean_widget_inputs(ntype, node.get("widgets_values_named"))
        for sock in node.get("inputs") or []:
            if sock.get("link") is not None:
                resolved = resolve_top_link(int(sock["link"]))
                if resolved is not None:
                    inputs[sock["name"]] = resolved
        title = node.get("title") or ntype
        api_prompt[str(node_id)] = {
            "class_type": ntype,
            "_meta": {"title": title},
            "inputs": inputs,
        }

    return api_prompt


def _find_node_by_type(
    nodes: list[dict[str, Any]], node_type: str, title_substr: str = ""
) -> dict[str, Any] | None:
    for n in nodes:
        if n.get("type") == node_type:
            if not title_substr or title_substr.lower() in (n.get("title") or "").lower():
                return n
    return None


def get_workflow_defaults(wf_id: str) -> dict[str, Any]:
    doc = WORKFLOW_DOCS.get(wf_id)
    if not doc:
        raise ValueError(f"Unknown workflow ID: {wf_id}")
    nodes = doc.get("nodes", [])
    res_node = _find_node_by_type(nodes, "ResolutionSelector")
    dur_node = _find_node_by_type(nodes, "PrimitiveFloat")
    prompt_node = _find_node_by_type(nodes, "PrimitiveStringMultiline")
    refpack_node = _find_node_by_type(nodes, "MiniMaxH3ReferencePack")
    extract_node = _find_node_by_type(nodes, "MiniMaxH3RefModExtract") or _find_node_by_type(
        nodes, "MiniMaxH3RefModAudioExtract"
    )

    ar_short = "9:16"
    megapixels = 0.7
    multiple = 32
    if res_node:
        wvn = res_node.get("widgets_values_named") or {}
        ar_label = wvn.get("aspect_ratio", "9:16 (Portrait Widescreen)")
        ar_short = COMFY_LABEL_TO_SHORT_AR.get(ar_label, "9:16")
        megapixels = float(wvn.get("megapixels", 0.7))
        multiple = int(wvn.get("multiple", 32))

    seconds = 5.0
    if dur_node:
        seconds = float((dur_node.get("widgets_values_named") or {}).get("value", 5.0))

    default_prompt = ""
    if extract_node:
        default_prompt = str(
            (extract_node.get("widgets_values_named") or {}).get("name", "reference_v1")
        )

    dims = compute_resolution(ar_short, megapixels, multiple)
    return {
        "aspect_ratio": ar_short,
        "megapixels": megapixels,
        "multiple": multiple,
        "width": dims["width"],
        "height": dims["height"],
        "seconds": seconds,
        "frames": seconds_to_frames(seconds),
        "default_prompt": default_prompt,
    }


def get_workflow_advanced_fields(wf_id: str) -> list[dict[str, Any]]:
    doc = WORKFLOW_DOCS.get(wf_id)
    if not doc:
        raise ValueError(f"Unknown workflow ID: {wf_id}")

    nodes = doc.get("nodes", [])
    sgs = (doc.get("definitions") or {}).get("subgraphs", [])
    fields: list[dict[str, Any]] = []

    # 1. Sampling & Scheduler
    sampler_node = _find_node_by_type(nodes, "KSamplerSelect")
    sched_node = _find_node_by_type(nodes, "BasicScheduler")
    noise_node = _find_node_by_type(nodes, "RandomNoise")
    ext_sig_node = _find_node_by_type(nodes, "ExtendIntermediateSigmas")

    if sampler_node:
        wvn = sampler_node.get("widgets_values_named") or {}
        fields.append(
            {
                "id": "sampler_name",
                "group": "Sampling & Schedule",
                "label": "Sampler",
                "type": "select",
                "options": SAMPLER_OPTIONS,
                "value": wvn.get("sampler_name", "euler"),
            }
        )
    if sched_node:
        wvn = sched_node.get("widgets_values_named") or {}
        fields.append(
            {
                "id": "scheduler",
                "group": "Sampling & Schedule",
                "label": "Scheduler",
                "type": "select",
                "options": SCHEDULER_OPTIONS,
                "value": wvn.get("scheduler", "simple"),
            }
        )
        fields.append(
            {
                "id": "steps",
                "group": "Sampling & Schedule",
                "label": "Steps",
                "type": "number",
                "min": 1,
                "max": 50,
                "step": 1,
                "value": int(wvn.get("steps", 8)),
                "help": "8 with Turbo LoRA at full strength; 10–12 at lower strength; 20 for RefMod.",
            }
        )
        fields.append(
            {
                "id": "denoise",
                "group": "Sampling & Schedule",
                "label": "Denoise",
                "type": "number",
                "min": 0.0,
                "max": 1.0,
                "step": 0.05,
                "value": float(wvn.get("denoise", 1.0)),
            }
        )
    if noise_node:
        fields.append(
            {
                "id": "seed",
                "group": "Sampling & Schedule",
                "label": "Seed (−1 = random)",
                "type": "number",
                "step": 1,
                "value": -1,
                "help": "Fixed seed for reproducible generations; -1 generates a random seed each run.",
            }
        )
    if ext_sig_node:
        wvn = ext_sig_node.get("widgets_values_named") or {}
        is_enabled = int(ext_sig_node.get("mode", 0)) == 0
        fields.append(
            {
                "id": "extend_sigmas_enabled",
                "group": "Extend Intermediate Sigmas",
                "label": "Enable extra detail sigmas",
                "type": "select",
                "options": ["false", "true"],
                "value": "true" if is_enabled else "false",
                "help": "Un-bypasses ExtendIntermediateSigmas node to add extra intermediate denoising steps.",
            }
        )
        fields.append(
            {
                "id": "extend_steps",
                "group": "Extend Intermediate Sigmas",
                "label": "Extra steps",
                "type": "number",
                "min": 1,
                "max": 10,
                "step": 1,
                "value": int(wvn.get("steps", 2)),
            }
        )
        fields.append(
            {
                "id": "extend_start_sigma",
                "group": "Extend Intermediate Sigmas",
                "label": "Start at sigma",
                "type": "number",
                "min": 0.0,
                "max": 1.0,
                "step": 0.05,
                "value": float(wvn.get("start_at_sigma", 0.8)),
            }
        )

    # 2. Resolution & LoRAs
    res_node = _find_node_by_type(nodes, "ResolutionSelector")
    if res_node:
        wvn = res_node.get("widgets_values_named") or {}
        fields.append(
            {
                "id": "megapixels",
                "group": "Resolution & LoRAs",
                "label": "Target Megapixels",
                "type": "number",
                "min": 0.2,
                "max": 2.0,
                "step": 0.05,
                "value": float(wvn.get("megapixels", 0.7)),
                "help": "0.7 MP ≈ 768p native MiniMax H3 resolution.",
            }
        )
        fields.append(
            {
                "id": "multiple",
                "group": "Resolution & LoRAs",
                "label": "Dimension multiple",
                "type": "number",
                "min": 8,
                "max": 128,
                "step": 8,
                "value": int(wvn.get("multiple", 32)),
            }
        )

    turbo_node = _find_node_by_type(nodes, "LoraLoaderModelOnly")
    if turbo_node:
        wvn = turbo_node.get("widgets_values_named") or {}
        cur_lora = wvn.get("lora_name", TURBO_LORA_OPTIONS[0])
        lora_opts = list(dict.fromkeys([cur_lora, *TURBO_LORA_OPTIONS]))
        fields.append(
            {
                "id": "turbo_lora_name",
                "group": "Resolution & LoRAs",
                "label": "Turbo LoRA",
                "type": "select",
                "options": lora_opts,
                "value": cur_lora,
            }
        )
        fields.append(
            {
                "id": "turbo_lora_strength",
                "group": "Resolution & LoRAs",
                "label": "Turbo LoRA strength",
                "type": "number",
                "min": 0.0,
                "max": 2.0,
                "step": 0.05,
                "value": float(wvn.get("strength_model", 0.8)),
            }
        )

    power_lora = _find_node_by_type(nodes, "Power Lora Loader (rgthree)")
    if power_lora:
        wvn = power_lora.get("widgets_values_named") or {}
        lora1 = wvn.get("lora_1") if isinstance(wvn.get("lora_1"), dict) else {}
        fields.append(
            {
                "id": "custom_lora_on",
                "group": "Resolution & LoRAs",
                "label": "Enable Custom Character/Style LoRA",
                "type": "select",
                "options": ["false", "true"],
                "value": "true" if lora1.get("on") else "false",
            }
        )
        fields.append(
            {
                "id": "custom_lora_name",
                "group": "Resolution & LoRAs",
                "label": "Custom LoRA filename (in models/loras)",
                "type": "text",
                "value": str(lora1.get("lora", "")),
                "help": "Filename of a CivitAI or HuggingFace LoRA in models/loras.",
            }
        )
        fields.append(
            {
                "id": "custom_lora_strength",
                "group": "Resolution & LoRAs",
                "label": "Custom LoRA strength",
                "type": "number",
                "min": -2.0,
                "max": 2.0,
                "step": 0.05,
                "value": float(lora1.get("strength", 1.0)),
            }
        )

    # 3. Auto Prompt (OpenRouterSimple inside subgraph)
    for sg in sgs:
        or_node = _find_node_by_type(sg.get("nodes", []), "OpenRouterSimple")
        if or_node:
            wvn = or_node.get("widgets_values_named") or {}
            fields.extend(
                [
                    {
                        "id": "openrouter_model",
                        "group": "Auto Prompt (OpenRouter LLM)",
                        "label": "OpenRouter Model",
                        "type": "text",
                        "value": str(wvn.get("model", "google/gemini-3-flash-preview")),
                    },
                    {
                        "id": "openrouter_reasoning",
                        "group": "Auto Prompt (OpenRouter LLM)",
                        "label": "Reasoning effort",
                        "type": "select",
                        "options": ["auto", "none", "low", "medium", "high"],
                        "value": str(wvn.get("reasoning_effort", "auto")),
                    },
                    {
                        "id": "openrouter_temperature",
                        "group": "Auto Prompt (OpenRouter LLM)",
                        "label": "Temperature",
                        "type": "number",
                        "min": 0.0,
                        "max": 2.0,
                        "step": 0.05,
                        "value": float(wvn.get("temperature", 1.0)),
                    },
                    {
                        "id": "openrouter_max_tokens",
                        "group": "Auto Prompt (OpenRouter LLM)",
                        "label": "Max tokens",
                        "type": "number",
                        "min": 256,
                        "max": 16384,
                        "step": 256,
                        "value": int(wvn.get("max_tokens", 4096)),
                    },
                    {
                        "id": "openrouter_system_prompt",
                        "group": "Auto Prompt (OpenRouter LLM)",
                        "label": "System prompt",
                        "type": "textarea",
                        "value": str(wvn.get("system_prompt", "")),
                    },
                ]
            )

    # 4. R2V Reference Pack settings
    refpack_node = _find_node_by_type(nodes, "MiniMaxH3ReferencePack")
    r2v_node = _find_node_by_type(nodes, "MiniMaxH3ReferenceToVideo")
    if refpack_node:
        wvn = refpack_node.get("widgets_values_named") or {}
        fields.extend(
            [
                {
                    "id": "r2v_prompt_provider",
                    "group": "Reference-to-Video (R2V)",
                    "label": "Prompt Provider",
                    "type": "select",
                    "options": ["openrouter", "none", "local"],
                    "value": str(wvn.get("prompt_provider", "openrouter")),
                    "help": "'openrouter' writes the 6-section Ref2VA prompt via VLM; 'none' passes your prompt text straight through.",
                },
                {
                    "id": "r2v_openrouter_model",
                    "group": "Reference-to-Video (R2V)",
                    "label": "OpenRouter VLM Model",
                    "type": "text",
                    "value": str(
                        wvn.get("openrouter_model", "google/gemini-3-flash-preview")
                    ),
                },
                {
                    "id": "r2v_job_type",
                    "group": "Reference-to-Video (R2V)",
                    "label": "Job Type",
                    "type": "select",
                    "options": ["auto", "standard", "replacement"],
                    "value": str(wvn.get("job_type", "auto")),
                },
                {
                    "id": "r2v_max_reference_edge",
                    "group": "Reference-to-Video (R2V)",
                    "label": "Max reference image edge (px)",
                    "type": "number",
                    "min": 0,
                    "max": 4096,
                    "step": 64,
                    "value": int(wvn.get("max_reference_edge", 2048)),
                },
            ]
        )
    if r2v_node:
        wvn = r2v_node.get("widgets_values_named") or {}
        fields.append(
            {
                "id": "r2v_ref_image_size",
                "group": "Reference-to-Video (R2V)",
                "label": "Ref image size mode",
                "type": "select",
                "options": ["max", "area"],
                "value": str(wvn.get("ref_image_size", "max")),
            }
        )

    # 5. 2x Latent Upscaling settings (inside Upscaling subgraph)
    for sg in sgs:
        up_node = _find_node_by_type(sg.get("nodes", []), "MinimaxH3LatentUpscaler3D")
        if up_node:
            wvn = up_node.get("widgets_values_named") or {}
            up_sampler = _find_node_by_type(sg.get("nodes", []), "KSamplerSelect")
            up_sigmas = _find_node_by_type(
                sg.get("nodes", []), "ManualSigmas", "3 step"
            )
            fields.extend(
                [
                    {
                        "id": "upscale_scale",
                        "group": "2× Latent Upscaler",
                        "label": "Upscale multiplier",
                        "type": "number",
                        "min": 1.25,
                        "max": 3.0,
                        "step": 0.25,
                        "value": float(wvn.get("mode.scale", 2.0)),
                    },
                    {
                        "id": "upscale_precision",
                        "group": "2× Latent Upscaler",
                        "label": "Upscaler precision",
                        "type": "select",
                        "options": ["fp16", "bf16", "fp32"],
                        "value": str(wvn.get("precision", "fp16")),
                    },
                    {
                        "id": "upscale_temporal_chunking",
                        "group": "2× Latent Upscaler",
                        "label": "Temporal chunking (low VRAM)",
                        "type": "select",
                        "options": ["false", "true"],
                        "value": "true"
                        if wvn.get("enable_temporal_chunking")
                        else "false",
                    },
                    {
                        "id": "upscale_sampler",
                        "group": "2× Latent Upscaler",
                        "label": "Refine sampler",
                        "type": "select",
                        "options": SAMPLER_OPTIONS,
                        "value": str(
                            (
                                (up_sampler or {}).get("widgets_values_named") or {}
                            ).get("sampler_name", "euler")
                        ),
                    },
                    {
                        "id": "upscale_sigmas",
                        "group": "2× Latent Upscaler",
                        "label": "Refine sigmas (3-step)",
                        "type": "text",
                        "value": str(
                            ((up_sigmas or {}).get("widgets_values_named") or {}).get(
                                "sigmas", "0.9035, 0.6316, 0.3158, 0.0000"
                            )
                        ),
                    },
                ]
            )

    # 6. RefMod Apply settings (in MiniMax - RefMod)
    refmod_apply = _find_node_by_type(nodes, "MiniMaxH3RefModApply")
    if refmod_apply:
        wvn = refmod_apply.get("widgets_values_named") or {}
        fields.extend(
            [
                {
                    "id": "refmod_retention",
                    "group": "RefMod Apply",
                    "label": "Master retention strength (0–1)",
                    "type": "number",
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.05,
                    "value": float(wvn.get("retention", 0.85)),
                    "help": "1.0 = fully preserved, 0.7 = partially preserved, 0.4 = attribute transfer.",
                },
                {
                    "id": "refmod_curve_direction",
                    "group": "RefMod Apply",
                    "label": "Curve direction",
                    "type": "select",
                    "options": [
                        "constant",
                        "concept_at_start",
                        "concept_at_end",
                        "concept_at_middle",
                        "concept_at_ends",
                    ],
                    "value": str(wvn.get("curve_direction", "constant")),
                },
                {
                    "id": "refmod_curve_shape",
                    "group": "RefMod Apply",
                    "label": "Curve shape",
                    "type": "select",
                    "options": [
                        "linear",
                        "ease",
                        "sigmoid",
                        "tanh",
                        "quadratic",
                        "cubic",
                        "exponential",
                        "stair",
                    ],
                    "value": str(wvn.get("curve_shape", "linear")),
                },
                {
                    "id": "refmod_curve_value",
                    "group": "RefMod Apply",
                    "label": "Curve endpoint weight",
                    "type": "number",
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.05,
                    "value": float(wvn.get("curve_value", 1.0)),
                },
                {
                    "id": "refmod_override",
                    "group": "RefMod Apply",
                    "label": "Use mod's saved config override",
                    "type": "select",
                    "options": ["false", "true"],
                    "value": "true" if wvn.get("override") else "false",
                },
            ]
        )

    # 7. RefMod Studio extraction settings
    folder_loader = _find_node_by_type(nodes, "MiniMaxH3RefModFolderLoader")
    if folder_loader:
        wvn = folder_loader.get("widgets_values_named") or {}
        fields.extend(
            [
                {
                    "id": "folder_max_items",
                    "group": "RefMod Source Loader",
                    "label": "Max media items",
                    "type": "number",
                    "min": 1,
                    "max": 64,
                    "step": 1,
                    "value": int(wvn.get("max_items", 8)),
                },
                {
                    "id": "folder_max_frames",
                    "group": "RefMod Source Loader",
                    "label": "Max sampled frames per video",
                    "type": "number",
                    "min": 2,
                    "max": 240,
                    "step": 1,
                    "value": int(wvn.get("max_frames", 49)),
                },
                {
                    "id": "folder_max_edge",
                    "group": "RefMod Source Loader",
                    "label": "Max source edge (px)",
                    "type": "number",
                    "min": 256,
                    "max": 4096,
                    "step": 64,
                    "value": int(wvn.get("max_edge", 1024)),
                },
            ]
        )

    vis_extract = _find_node_by_type(nodes, "MiniMaxH3RefModExtract")
    if vis_extract:
        wvn = vis_extract.get("widgets_values_named") or {}
        save_node = _find_node_by_type(nodes, "MiniMaxH3RefModSave")
        save_wvn = (save_node or {}).get("widgets_values_named") or {}
        fields.extend(
            [
                {
                    "id": "refmod_subfolder",
                    "group": "RefMod Extraction",
                    "label": "Save subfolder (under models/refmods/)",
                    "type": "text",
                    "value": str(save_wvn.get("subfolder", "people")),
                },
                {
                    "id": "refmod_mode",
                    "group": "RefMod Extraction",
                    "label": "Encoding mode",
                    "type": "select",
                    "options": ["Full Reference", "Compressed Reference"],
                    "value": str(wvn.get("mode", "Full Reference")),
                },
                {
                    "id": "refmod_concept_type",
                    "group": "RefMod Extraction",
                    "label": "Concept type",
                    "type": "select",
                    "options": [
                        "identity",
                        "pose_motion",
                        "clothing",
                        "background",
                        "style",
                        "generic",
                    ],
                    "value": str(wvn.get("concept_type", "identity")),
                },
                {
                    "id": "refmod_resolution",
                    "group": "RefMod Extraction",
                    "label": "Reference short-edge resolution (px)",
                    "type": "number",
                    "min": 256,
                    "max": 2048,
                    "step": 64,
                    "value": int(wvn.get("ref_resolution", 1024)),
                },
                {
                    "id": "refmod_latent_frames",
                    "group": "RefMod Extraction",
                    "label": "Max latent frames",
                    "type": "number",
                    "min": 1,
                    "max": 128,
                    "step": 1,
                    "value": int(wvn.get("latent_frames", 16)),
                },
                {
                    "id": "refmod_max_tokens",
                    "group": "RefMod Extraction",
                    "label": "Token budget cap",
                    "type": "number",
                    "min": 0,
                    "max": 131072,
                    "step": 512,
                    "value": int(wvn.get("max_tokens", 16384)),
                },
                {
                    "id": "refmod_budget_policy",
                    "group": "RefMod Extraction",
                    "label": "Budget policy",
                    "type": "select",
                    "options": ["error", "truncate"],
                    "value": str(wvn.get("budget_policy", "error")),
                },
                {
                    "id": "refmod_description",
                    "group": "RefMod Extraction",
                    "label": "Description (optional prompt hint)",
                    "type": "textarea",
                    "value": str(wvn.get("description", "")),
                },
            ]
        )

    aud_extract = _find_node_by_type(nodes, "MiniMaxH3RefModAudioExtract")
    if aud_extract:
        wvn = aud_extract.get("widgets_values_named") or {}
        save_node = _find_node_by_type(nodes, "MiniMaxH3RefModSave")
        save_wvn = (save_node or {}).get("widgets_values_named") or {}
        fields.extend(
            [
                {
                    "id": "refmod_subfolder",
                    "group": "Audio RefMod Extraction",
                    "label": "Save subfolder (under models/refmods/)",
                    "type": "text",
                    "value": str(save_wvn.get("subfolder", "audio")),
                },
                {
                    "id": "audio_concept_type",
                    "group": "Audio RefMod Extraction",
                    "label": "Audio concept type",
                    "type": "select",
                    "options": [
                        "voice",
                        "singing",
                        "music_style",
                        "sound_fx",
                        "ambience",
                    ],
                    "value": str(wvn.get("concept_type", "ambience")),
                },
                {
                    "id": "audio_max_seconds",
                    "group": "Audio RefMod Extraction",
                    "label": "Max duration excerpt (seconds)",
                    "type": "number",
                    "min": 1.0,
                    "max": 60.0,
                    "step": 1.0,
                    "value": float(wvn.get("max_seconds", 30.0)),
                },
                {
                    "id": "audio_max_tokens",
                    "group": "Audio RefMod Extraction",
                    "label": "Audio token budget",
                    "type": "number",
                    "min": 0,
                    "max": 32768,
                    "step": 256,
                    "value": int(wvn.get("max_tokens", 5120)),
                },
                {
                    "id": "audio_budget_policy",
                    "group": "Audio RefMod Extraction",
                    "label": "Budget policy",
                    "type": "select",
                    "options": ["error", "truncate"],
                    "value": str(wvn.get("budget_policy", "error")),
                },
                {
                    "id": "refmod_description",
                    "group": "Audio RefMod Extraction",
                    "label": "Description (optional prompt hint)",
                    "type": "textarea",
                    "value": str(wvn.get("description", "")),
                },
            ]
        )

    # 8. Video output encode settings
    vhs_node = _find_node_by_type(nodes, "VHS_VideoCombine")
    if vhs_node:
        wvn = vhs_node.get("widgets_values_named") or {}
        fields.extend(
            [
                {
                    "id": "video_crf",
                    "group": "Video Output (H.264 MP4)",
                    "label": "CRF quality (lower = higher quality)",
                    "type": "number",
                    "min": 0,
                    "max": 35,
                    "step": 1,
                    "value": int(wvn.get("crf", 12)),
                },
                {
                    "id": "filename_prefix",
                    "group": "Video Output (H.264 MP4)",
                    "label": "Filename prefix",
                    "type": "text",
                    "value": str(wvn.get("filename_prefix", "MiniMaxH3")),
                },
            ]
        )

    return fields


def get_workflows_catalog() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for wf in CATALOG_DATA.get("workflows", []):
        wf_id = wf["id"]
        classification = classify_workflow(wf_id, wf)
        defaults = get_workflow_defaults(wf_id)
        items.append(
            {
                "id": wf_id,
                "title": wf["title"],
                "description": wf["description"],
                "file": wf["file"],
                "difficulty": wf.get("difficulty", "Beginner"),
                "inputs": wf.get("inputs", []),
                "outputs": wf.get("outputs", []),
                "tags": wf.get("tags", []),
                "notes": wf.get("notes", []),
                **classification,
                "defaults": defaults,
                "advanced_fields": get_workflow_advanced_fields(wf_id),
            }
        )
    return items


def build_payload(
    *,
    workflow_id: str = DEFAULT_WORKFLOW_ID,
    prompt: str = "",
    seconds: float = 5.0,
    aspect_ratio: str = "9:16",
    image_name: str = "",
    image_data_url: str = "",
    openrouter_api_key: str = "",
    references: list[dict[str, Any]] | None = None,
    refmods: list[dict[str, Any]] | None = None,
    studio_files: list[dict[str, Any]] | None = None,
    quant_profile: str = "int8",
    overrides: dict[str, Any] | None = None,
    rng: random.Random | None = None,
) -> dict[str, Any]:
    if workflow_id not in WORKFLOW_DOCS:
        raise ValueError(f"Unsupported workflow_id: {workflow_id}")

    wf_meta = WORKFLOW_META_BY_ID[workflow_id]
    classification = classify_workflow(workflow_id, wf_meta)
    overrides = overrides or {}
    random_source = rng or random.SystemRandom()

    doc = copy.deepcopy(WORKFLOW_DOCS[workflow_id])
    nodes = doc.get("nodes", [])
    sgs = (doc.get("definitions") or {}).get("subgraphs", [])

    # Handle ExtendIntermediateSigmas un-bypass BEFORE compiling graph
    ext_sig_node = _find_node_by_type(nodes, "ExtendIntermediateSigmas")
    if ext_sig_node:
        if "extend_sigmas_enabled" in overrides:
            enable_ext = str(overrides["extend_sigmas_enabled"]).lower() == "true"
            ext_sig_node["mode"] = 0 if enable_ext else 4
        wvn = ext_sig_node.setdefault("widgets_values_named", {})
        if "extend_steps" in overrides:
            wvn["steps"] = int(float(overrides["extend_steps"]))
        if "extend_start_sigma" in overrides:
            wvn["start_at_sigma"] = float(overrides["extend_start_sigma"])

    # Apply aspect ratio & resolution
    if aspect_ratio not in ASPECT_RATIO_SPECS:
        raise ValueError(f"Unsupported aspect ratio: {aspect_ratio}")

    res_node = _find_node_by_type(nodes, "ResolutionSelector")
    megapixels = float(overrides.get("megapixels", 0.7))
    multiple = int(float(overrides.get("multiple", 32)))
    if res_node:
        wvn = res_node.setdefault("widgets_values_named", {})
        wvn["aspect_ratio"] = ASPECT_RATIO_SPECS[aspect_ratio]["comfy_label"]
        wvn["megapixels"] = megapixels
        wvn["multiple"] = multiple

    dims = compute_resolution(aspect_ratio, megapixels, multiple)

    # Apply duration
    if not classification["is_refmod_studio"]:
        seconds_to_frames(seconds)
        dur_node = _find_node_by_type(nodes, "PrimitiveFloat")
        if dur_node:
            dur_node.setdefault("widgets_values_named", {})["value"] = float(seconds)

    # Apply prompt / direction / RefMod name
    clean_prompt = (prompt or "").strip()
    if classification["requires_prompt"] and not clean_prompt:
        if classification["category"] == "r2v" and overrides.get("r2v_prompt_provider") != "none":
            pass
        else:
            raise ValueError("Prompt is required for this workflow.")

    prompt_node = _find_node_by_type(nodes, "PrimitiveStringMultiline")
    if prompt_node and clean_prompt:
        prompt_node.setdefault("widgets_values_named", {})["value"] = clean_prompt

    # OpenRouter API key node (for Auto Prompt / R2V workflows)
    or_key_node = _find_node_by_type(nodes, "PrimitiveString", "OpenRouter API Key")
    if or_key_node and openrouter_api_key.strip():
        or_key_node.setdefault("widgets_values_named", {})["value"] = (
            openrouter_api_key.strip()
        )

    uploaded_files: list[dict[str, str]] = []

    # Category-specific inputs
    if classification["category"] == "i2v":
        if not image_data_url or not image_data_url.startswith("data:image/"):
            raise ValueError("Source image is required for Image-to-Video workflows.")
        normalized_img = sanitize_filename(image_name, "source-image.png")
        load_img_node = _find_node_by_type(nodes, "LoadImage")
        if load_img_node:
            load_img_node.setdefault("widgets_values_named", {})["image"] = normalized_img
        uploaded_files.append(
            {"name": normalized_img, "data": image_data_url, "subfolder": ""}
        )

    elif classification["category"] == "r2v":
        refpack_node = _find_node_by_type(nodes, "MiniMaxH3ReferencePack")
        r2v_node = _find_node_by_type(nodes, "MiniMaxH3ReferenceToVideo")
        if refpack_node:
            wvn = refpack_node.setdefault("widgets_values_named", {})
            wvn["direction"] = clean_prompt
            if openrouter_api_key.strip():
                wvn["openrouter_api_key"] = openrouter_api_key.strip()
            if "r2v_prompt_provider" in overrides:
                wvn["prompt_provider"] = str(overrides["r2v_prompt_provider"])
            if "r2v_openrouter_model" in overrides:
                wvn["openrouter_model"] = str(overrides["r2v_openrouter_model"])
            if "r2v_job_type" in overrides:
                wvn["job_type"] = str(overrides["r2v_job_type"])
            if "r2v_max_reference_edge" in overrides:
                wvn["max_reference_edge"] = int(
                    float(overrides["r2v_max_reference_edge"])
                )

            ref_entries: list[dict[str, Any]] = []
            for idx, ref_item in enumerate(references or [], start=1):
                kind = str(ref_item.get("kind", "image")).lower()
                if kind not in ("image", "video", "audio"):
                    raise ValueError(f"Unsupported reference kind: {kind}")
                raw_name = ref_item.get("name") or f"ref_{kind}_{idx}"
                safe_ref_name = sanitize_filename(raw_name, f"ref_{kind}_{idx}.bin")
                data_url = str(ref_item.get("data_url") or "")
                if data_url:
                    uploaded_files.append(
                        {"name": safe_ref_name, "data": data_url, "subfolder": ""}
                    )
                entry: dict[str, Any] = {"kind": kind, "file": safe_ref_name}
                if kind == "video":
                    entry["use_soundtrack"] = bool(
                        ref_item.get("use_soundtrack", True)
                    )
                ref_entries.append(entry)

            wvn["references_json"] = json.dumps({"references": ref_entries})

        if r2v_node and "r2v_ref_image_size" in overrides:
            r2v_node.setdefault("widgets_values_named", {})["ref_image_size"] = str(
                overrides["r2v_ref_image_size"]
            )

    elif classification["category"] == "refmod":
        loader_node = _find_node_by_type(nodes, "MiniMaxH3RefModsLoader")
        apply_node = _find_node_by_type(nodes, "MiniMaxH3RefModApply")
        if loader_node and refmods:
            wvn = loader_node.setdefault("widgets_values_named", {})
            for slot_idx in range(1, 9):
                wvn[f"mod_{slot_idx}"] = "(none)"
                wvn[f"strength_{slot_idx}"] = 1.0
                wvn[f"copies_{slot_idx}"] = 1
            for slot_idx, mod_spec in enumerate((refmods or [])[:8], start=1):
                mod_name = str(mod_spec.get("name") or "(none)").strip() or "(none)"
                wvn[f"mod_{slot_idx}"] = mod_name
                wvn[f"strength_{slot_idx}"] = float(mod_spec.get("strength", 1.0))
                wvn[f"copies_{slot_idx}"] = int(mod_spec.get("copies", 1))
        if apply_node:
            awvn = apply_node.setdefault("widgets_values_named", {})
            if "refmod_retention" in overrides:
                awvn["retention"] = float(overrides["refmod_retention"])
            if "refmod_curve_direction" in overrides:
                awvn["curve_direction"] = str(overrides["refmod_curve_direction"])
            if "refmod_curve_shape" in overrides:
                awvn["curve_shape"] = str(overrides["refmod_curve_shape"])
            if "refmod_curve_value" in overrides:
                awvn["curve_value"] = float(overrides["refmod_curve_value"])
            if "refmod_override" in overrides:
                awvn["override"] = str(overrides["refmod_override"]).lower() == "true"

    elif classification["category"] == "refmod_studio":
        studio_kind = classification["studio_kind"]
        mod_name = sanitize_filename(clean_prompt or f"{studio_kind}_reference_v1", "")
        mod_name = re.sub(r"\.safetensors$", "", mod_name, flags=re.IGNORECASE) or (
            f"{studio_kind}_reference_v1"
        )
        if not studio_files:
            raise ValueError(
                f"Please upload at least one {studio_kind} file to build a RefMod pack."
            )

        save_node = _find_node_by_type(nodes, "MiniMaxH3RefModSave")
        if save_node and "refmod_subfolder" in overrides:
            save_node.setdefault("widgets_values_named", {})["subfolder"] = str(
                overrides["refmod_subfolder"]
            ).strip()

        if studio_kind in ("image", "video"):
            folder_loader = _find_node_by_type(nodes, "MiniMaxH3RefModFolderLoader")
            vis_extract = _find_node_by_type(nodes, "MiniMaxH3RefModExtract")
            target_subfolder = f"refmod_{studio_kind}s/{mod_name}"
            if folder_loader:
                fwvn = folder_loader.setdefault("widgets_values_named", {})
                fwvn["folder"] = target_subfolder
                if "folder_max_items" in overrides:
                    fwvn["max_items"] = int(float(overrides["folder_max_items"]))
                if "folder_max_frames" in overrides:
                    fwvn["max_frames"] = int(float(overrides["folder_max_frames"]))
                if "folder_max_edge" in overrides:
                    fwvn["max_edge"] = int(float(overrides["folder_max_edge"]))
            if vis_extract:
                ewvn = vis_extract.setdefault("widgets_values_named", {})
                ewvn["name"] = mod_name
                if "refmod_mode" in overrides:
                    ewvn["mode"] = str(overrides["refmod_mode"])
                if "refmod_concept_type" in overrides:
                    ewvn["concept_type"] = str(overrides["refmod_concept_type"])
                if "refmod_resolution" in overrides:
                    ewvn["ref_resolution"] = int(float(overrides["refmod_resolution"]))
                if "refmod_latent_frames" in overrides:
                    ewvn["latent_frames"] = int(
                        float(overrides["refmod_latent_frames"])
                    )
                if "refmod_max_tokens" in overrides:
                    ewvn["max_tokens"] = int(float(overrides["refmod_max_tokens"]))
                if "refmod_budget_policy" in overrides:
                    ewvn["budget_policy"] = str(overrides["refmod_budget_policy"])
                if "refmod_description" in overrides:
                    ewvn["description"] = str(overrides["refmod_description"])
            for idx, fitem in enumerate(studio_files, start=1):
                fname = sanitize_filename(
                    fitem.get("name", f"item_{idx}.png"), f"item_{idx}.png"
                )
                uploaded_files.append(
                    {
                        "name": fname,
                        "data": str(fitem.get("data_url") or ""),
                        "subfolder": target_subfolder,
                    }
                )
        else:
            # Audio RefMod Studio
            fitem = studio_files[0]
            fname = sanitize_filename(fitem.get("name", "reference.mp3"), "reference.mp3")
            load_aud = _find_node_by_type(nodes, "LoadAudio")
            aud_extract = _find_node_by_type(nodes, "MiniMaxH3RefModAudioExtract")
            if load_aud:
                load_aud.setdefault("widgets_values_named", {})["audio"] = fname
            if aud_extract:
                awvn = aud_extract.setdefault("widgets_values_named", {})
                awvn["name"] = mod_name
                if "audio_concept_type" in overrides:
                    awvn["concept_type"] = str(overrides["audio_concept_type"])
                if "audio_max_seconds" in overrides:
                    awvn["max_seconds"] = float(overrides["audio_max_seconds"])
                if "audio_max_tokens" in overrides:
                    awvn["max_tokens"] = int(float(overrides["audio_max_tokens"]))
                if "audio_budget_policy" in overrides:
                    awvn["budget_policy"] = str(overrides["audio_budget_policy"])
                if "refmod_description" in overrides:
                    awvn["description"] = str(overrides["refmod_description"])
            uploaded_files.append({"name": fname, "data": str(fitem.get("data_url") or ""), "subfolder": ""})

    # Apply common overrides (Sampler, Scheduler, Seed, LoRAs, OpenRouter, Upscaler, VHS)
    sampler_node = _find_node_by_type(nodes, "KSamplerSelect")
    if sampler_node and "sampler_name" in overrides:
        sampler_node.setdefault("widgets_values_named", {})["sampler_name"] = str(
            overrides["sampler_name"]
        )

    sched_node = _find_node_by_type(nodes, "BasicScheduler")
    if sched_node:
        swvn = sched_node.setdefault("widgets_values_named", {})
        if "scheduler" in overrides:
            swvn["scheduler"] = str(overrides["scheduler"])
        if "steps" in overrides:
            swvn["steps"] = int(float(overrides["steps"]))
        if "denoise" in overrides:
            swvn["denoise"] = float(overrides["denoise"])

    seed_val: int | None = None
    if "seed" in overrides:
        try:
            parsed_seed = int(float(str(overrides["seed"]).strip()))
            if parsed_seed >= 0:
                seed_val = parsed_seed
        except ValueError:
            pass

    noise_node = _find_node_by_type(nodes, "RandomNoise")
    if noise_node:
        noise_node.setdefault("widgets_values_named", {})["noise_seed"] = (
            seed_val if seed_val is not None else random_source.randrange(1, 10**15)
        )

    turbo_node = _find_node_by_type(nodes, "LoraLoaderModelOnly")
    if turbo_node:
        twvn = turbo_node.setdefault("widgets_values_named", {})
        if "turbo_lora_name" in overrides:
            twvn["lora_name"] = str(overrides["turbo_lora_name"])
        if "turbo_lora_strength" in overrides:
            twvn["strength_model"] = float(overrides["turbo_lora_strength"])

    power_lora = _find_node_by_type(nodes, "Power Lora Loader (rgthree)")
    if power_lora:
        pwvn = power_lora.setdefault("widgets_values_named", {})
        custom_on = str(overrides.get("custom_lora_on", "false")).lower() == "true"
        custom_name = str(overrides.get("custom_lora_name", "")).strip()
        custom_strength = float(overrides.get("custom_lora_strength", 1.0))
        if custom_on and custom_name:
            pwvn["lora_1"] = {
                "on": True,
                "lora": custom_name,
                "strength": custom_strength,
                "strengthTwo": None,
            }
        elif "lora_1" in pwvn and isinstance(pwvn["lora_1"], dict):
            pwvn["lora_1"]["on"] = False

    for sg in sgs:
        or_node = _find_node_by_type(sg.get("nodes", []), "OpenRouterSimple")
        if or_node:
            owvn = or_node.setdefault("widgets_values_named", {})
            if "openrouter_model" in overrides:
                owvn["model"] = str(overrides["openrouter_model"])
            if "openrouter_reasoning" in overrides:
                owvn["reasoning_effort"] = str(overrides["openrouter_reasoning"])
            if "openrouter_temperature" in overrides:
                owvn["temperature"] = float(overrides["openrouter_temperature"])
            if "openrouter_max_tokens" in overrides:
                owvn["max_tokens"] = int(float(overrides["openrouter_max_tokens"]))
            if "openrouter_system_prompt" in overrides:
                owvn["system_prompt"] = str(overrides["openrouter_system_prompt"])

        up_node = _find_node_by_type(sg.get("nodes", []), "MinimaxH3LatentUpscaler3D")
        if up_node:
            uwvn = up_node.setdefault("widgets_values_named", {})
            if "upscale_scale" in overrides:
                scale_val = float(overrides["upscale_scale"])
                uwvn["mode.scale"] = scale_val
                for top_n in nodes:
                    if top_n.get("type") == sg.get("id"):
                        top_n.setdefault("widgets_values_named", {})["mode.scale"] = scale_val
            if "upscale_precision" in overrides:
                uwvn["precision"] = str(overrides["upscale_precision"])
            if "upscale_temporal_chunking" in overrides:
                uwvn["enable_temporal_chunking"] = (
                    str(overrides["upscale_temporal_chunking"]).lower() == "true"
                )
            up_sampler = _find_node_by_type(sg.get("nodes", []), "KSamplerSelect")
            if up_sampler and "upscale_sampler" in overrides:
                up_sampler.setdefault("widgets_values_named", {})["sampler_name"] = str(
                    overrides["upscale_sampler"]
                )
            up_sigmas = _find_node_by_type(
                sg.get("nodes", []), "ManualSigmas", "3 step"
            )
            if up_sigmas and "upscale_sigmas" in overrides:
                up_sigmas.setdefault("widgets_values_named", {})["sigmas"] = str(
                    overrides["upscale_sigmas"]
                )
            up_noise = _find_node_by_type(sg.get("nodes", []), "RandomNoise")
            if up_noise:
                up_noise.setdefault("widgets_values_named", {})["noise_seed"] = (
                    seed_val
                    if seed_val is not None
                    else random_source.randrange(1, 10**15)
                )

    for n in nodes:
        if n.get("type") == "VHS_VideoCombine":
            vwvn = n.setdefault("widgets_values_named", {})
            if "video_crf" in overrides:
                vwvn["crf"] = int(float(overrides["video_crf"]))
            if "filename_prefix" in overrides and n.get("title") != "UpscaledVideo":
                vwvn["filename_prefix"] = str(overrides["filename_prefix"]).strip() or "MiniMaxH3"

    api_workflow = compile_litegraph_to_api(doc, quant_profile=quant_profile)

    return {
        "input": {
            "workflow_id": workflow_id,
            "workflow_title": wf_meta["title"],
            "workflow": api_workflow,
            "images": [
                {
                    "name": f["name"],
                    "image": f["data"],
                    "subfolder": f.get("subfolder", ""),
                }
                for f in uploaded_files
                if f.get("data")
            ],
        },
        "summary": {
            "workflow_id": workflow_id,
            "workflow_title": wf_meta["title"],
            "category": classification["category"],
            "is_upscale": classification["is_upscale"],
            "is_auto_prompt": classification["is_auto_prompt"],
            "frames": seconds_to_frames(seconds)
            if not classification["is_refmod_studio"]
            else 0,
            "seconds": seconds if not classification["is_refmod_studio"] else 0,
            "fps": FPS,
            "width": dims["width"],
            "height": dims["height"],
            "aspect_ratio": aspect_ratio,
            "quant_profile": quant_profile,
        },
    }
