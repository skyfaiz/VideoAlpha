from __future__ import annotations

import base64
import binascii
import copy
import json
import mimetypes
from pathlib import Path
from typing import Any

OUTPUT_KEYS = {
    "images": "image",
    "videos": "video",
    "gifs": "video",
    "audio": "audio",
}


def decode_base64_data(data: str) -> bytes:
    if "," in data and data.split(",", 1)[0].endswith(";base64"):
        data = data.split(",", 1)[1]

    try:
        return base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 media payload.") from exc


def safe_input_path(base_dir: str, relative_name: str) -> Path:
    relative_path = Path(relative_name)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise ValueError("Input file name must be a safe relative path.")

    target = (Path(base_dir) / relative_path).resolve()
    root = Path(base_dir).resolve()
    if root not in target.parents and target != root:
        raise ValueError("Input file path escapes COMFY_INPUT_DIR.")

    return target


def write_input_images(
    base_dir: str, images: list[dict[str, str]] | None
) -> list[str]:
    if not images:
        return []

    written_files: list[str] = []
    for image in images:
        name = image.get("name")
        data = image.get("image")
        subfolder = (image.get("subfolder") or "").strip().strip("/")
        if not name or not data:
            raise ValueError(
                "'images' must be a list of objects with 'name' and 'image' keys."
            )

        rel_path = f"{subfolder}/{name}" if subfolder else name
        target = safe_input_path(base_dir, rel_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(decode_base64_data(data))
        written_files.append(str(target))

    return written_files


def apply_input_filename_map(
    workflow: dict[str, Any], replacements: dict[str, str]
) -> dict[str, Any]:
    if not replacements:
        return copy.deepcopy(workflow)

    def _replace(value: Any) -> Any:
        if isinstance(value, str):
            if value in replacements:
                return replacements[value]
            if value.startswith("{") and '"references"' in value:
                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, dict) and isinstance(
                        parsed.get("references"), list
                    ):
                        for ref in parsed["references"]:
                            if isinstance(ref, dict) and ref.get("file") in replacements:
                                ref["file"] = replacements[ref["file"]]
                        return json.dumps(parsed)
                except json.JSONDecodeError:
                    pass
            return value
        if isinstance(value, list):
            return [_replace(item) for item in value]
        if isinstance(value, dict):
            return {key: _replace(item) for key, item in value.items()}
        return value

    return _replace(copy.deepcopy(workflow))


def collect_output_entries(outputs: dict[str, Any]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []

    for node_id, node_output in outputs.items():
        if not isinstance(node_output, dict):
            continue

        for output_key, media_kind in OUTPUT_KEYS.items():
            files = node_output.get(output_key, [])
            if not isinstance(files, list):
                continue

            for file_info in files:
                if not isinstance(file_info, dict):
                    continue
                filename = file_info.get("filename")
                if not filename:
                    continue

                entries.append(
                    {
                        "node_id": str(node_id),
                        "filename": filename,
                        "subfolder": file_info.get("subfolder", ""),
                        "type": file_info.get("type", "output"),
                        "media_kind": media_kind,
                    }
                )

    return entries


def collect_text_outputs(outputs: dict[str, Any]) -> list[dict[str, str]]:
    texts: list[dict[str, str]] = []
    for node_id, node_output in outputs.items():
        if not isinstance(node_output, dict):
            continue
        for key in ("text", "string", "result"):
            val = node_output.get(key)
            if isinstance(val, list):
                joined = "\n".join(str(x) for x in val if x is not None and str(x).strip())
                if joined.strip():
                    texts.append({"node_id": str(node_id), "text": joined.strip()})
            elif isinstance(val, str) and val.strip():
                texts.append({"node_id": str(node_id), "text": val.strip()})
    return texts


def extract_history_error(history_entry: dict[str, Any]) -> str | None:
    status_block = history_entry.get("status")
    if not isinstance(status_block, dict):
        return None
    if status_block.get("status_str") != "error":
        return None
    for msg in status_block.get("messages") or []:
        if (
            isinstance(msg, (list, tuple))
            and len(msg) >= 2
            and msg[0] == "execution_error"
            and isinstance(msg[1], dict)
        ):
            info = msg[1]
            node_type = info.get("node_type") or info.get("node_id") or "ComfyUI"
            exc_msg = (info.get("exception_message") or "Execution failed.").strip()
            return f"{node_type}: {exc_msg}"
    return "ComfyUI workflow execution failed."


def build_output_path(base_dir: str, entry: dict[str, str]) -> Path:
    subfolder = entry.get("subfolder") or ""
    target = (Path(base_dir) / subfolder / entry["filename"]).resolve()
    root = Path(base_dir).resolve()
    if root not in target.parents and target != root:
        raise ValueError("Output path escapes COMFY_OUTPUT_DIR.")
    return target


def guess_media_type(filename: str, media_kind: str) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    if guessed:
        return guessed
    if media_kind == "image":
        return "image/png"
    if media_kind == "audio":
        return "audio/mpeg"
    return "video/mp4"
