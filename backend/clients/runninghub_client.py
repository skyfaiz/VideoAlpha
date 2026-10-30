#!/usr/bin/env python3
"""
RunningHub AI App API client
Wraps the RunningHub OpenAPI for a single AI application (webapp):
  - app node introspection (nodeInfoList)
  - media upload
  - task submit / poll / result download
"""

import os
import time
import logging
from typing import Optional, Dict, Any, List

import requests

logger = logging.getLogger(__name__)


class RunningHubError(Exception):
    pass


class RunningHubClient:
    def __init__(
        self,
        api_key: str,
        app_id: str,
        base_url: str = "https://www.runninghub.ai",
    ):
        """
        Args:
            api_key: RunningHub API key
            app_id: AI application (webapp) id, e.g. "2062826985356881922"
            base_url: RunningHub host (global site: https://www.runninghub.ai)
        """
        if not api_key:
            raise RunningHubError("RunningHub API key is not configured")
        self.api_key = api_key
        self.app_id = str(app_id)
        self.base_url = base_url.rstrip("/")

        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
        })

    # ── internals ─────────────────────────────────────────────────────────────

    @staticmethod
    def _unwrap(resp_json: Dict[str, Any]) -> Dict[str, Any]:
        """RunningHub responses are wrapped as {code, msg, data}."""
        if not isinstance(resp_json, dict):
            raise RunningHubError(f"Unexpected response: {resp_json!r}")
        code = resp_json.get("code")
        if code not in (0, None):
            raise RunningHubError(
                f"RunningHub error {code}: {resp_json.get('msg') or resp_json.get('message')}"
            )
        return resp_json.get("data", resp_json)

    # ── app introspection ─────────────────────────────────────────────────────

    def get_app_nodes(self) -> List[Dict[str, Any]]:
        """
        Fetch the app's editable node list (nodeInfoList).

        Each entry: {nodeId, nodeName, fieldName, fieldValue, fieldType, description, fieldData?}
        fieldType is one of IMAGE / VIDEO / AUDIO / STRING / LIST / INT / FLOAT / ...
        """
        url = f"{self.base_url}/api/webapp/apiCallDemo"
        resp = self.session.get(
            url,
            params={"apiKey": self.api_key, "webappId": self.app_id},
            timeout=30,
        )
        resp.raise_for_status()
        data = self._unwrap(resp.json())
        return data.get("nodeInfoList", []) or []

    # ── file upload ───────────────────────────────────────────────────────────

    def upload_file(self, file_path: str) -> Optional[str]:
        """
        Upload a local file to RunningHub.

        Returns the server-side fileName (e.g. "api/xxxx.png") used as
        fieldValue in nodeInfoList, or None on failure.
        """
        # v2 binary upload (Bearer auth)
        try:
            url = f"{self.base_url}/openapi/v2/media/upload/binary"
            with open(file_path, "rb") as f:
                resp = self.session.post(url, files={"file": f}, timeout=300)
            data = self._unwrap(resp.json())
            file_name = data.get("fileName")
            if file_name:
                logger.info(f"RunningHub upload ok: {file_name}")
                return file_name
        except Exception as e:
            logger.warning(f"v2 upload failed, trying legacy endpoint: {e}")

        # legacy multipart upload (apiKey as form field)
        try:
            url = f"{self.base_url}/task/openapi/upload"
            with open(file_path, "rb") as f:
                resp = self.session.post(
                    url,
                    files={"file": f},
                    data={"apiKey": self.api_key, "fileType": "input"},
                    timeout=300,
                )
            data = self._unwrap(resp.json())
            file_name = data.get("fileName")
            if file_name:
                logger.info(f"RunningHub upload ok (legacy): {file_name}")
                return file_name
        except Exception as e:
            logger.error(f"RunningHub upload failed: {e}")

        return None

    # ── task submit / query ───────────────────────────────────────────────────

    def run_app(
        self,
        node_info_list: List[Dict[str, Any]],
        instance_type: Optional[str] = None,
        use_personal_queue: Optional[bool] = None,
        webhook_url: Optional[str] = None,
    ) -> Optional[str]:
        """
        Submit an AI app task. Returns taskId or None.
        """
        body: Dict[str, Any] = {"nodeInfoList": node_info_list}
        if instance_type:
            body["instanceType"] = instance_type
        if use_personal_queue is not None:
            body["usePersonalQueue"] = use_personal_queue
        if webhook_url:
            body["webhookUrl"] = webhook_url

        logger.info(
            "RunningHub submit app %s nodes=%s",
            self.app_id,
            [(n.get("nodeId"), n.get("fieldName")) for n in node_info_list],
        )

        # v2 endpoint: POST /openapi/v2/run/ai-app/{appId} (Bearer auth)
        try:
            url = f"{self.base_url}/openapi/v2/run/ai-app/{self.app_id}"
            resp = self.session.post(
                url, json=body, headers={"Content-Type": "application/json"}, timeout=60
            )
            if resp.status_code != 404:
                data = self._unwrap(resp.json())
                task_id = data.get("taskId")
                if task_id:
                    logger.info(f"RunningHub task submitted: {task_id}")
                    return str(task_id)
        except Exception as e:
            logger.warning(f"v2 run failed, trying legacy endpoint: {e}")

        # legacy endpoint: POST /task/openapi/ai-app/run (apiKey in body)
        try:
            url = f"{self.base_url}/task/openapi/ai-app/run"
            legacy_body = {
                "webappId": self.app_id,
                "apiKey": self.api_key,
                **body,
            }
            resp = self.session.post(
                url, json=legacy_body, headers={"Content-Type": "application/json"}, timeout=60
            )
            data = self._unwrap(resp.json())
            task_id = data.get("taskId")
            if task_id:
                logger.info(f"RunningHub task submitted (legacy): {task_id}")
                return str(task_id)
        except Exception as e:
            logger.error(f"RunningHub run failed: {e}")

        return None

    def query_task(self, task_id: str) -> Dict[str, Any]:
        """
        Query task status/output. Returns the unwrapped task data dict
        ({taskId, status, results, errorCode, errorMessage, usage, ...}).
        """
        # v2 query
        try:
            url = f"{self.base_url}/openapi/v2/query"
            resp = self.session.post(
                url,
                json={"taskId": str(task_id)},
                headers={"Content-Type": "application/json"},
                timeout=30,
            )
            if resp.status_code != 404:
                return self._unwrap(resp.json())
        except Exception as e:
            logger.warning(f"v2 query failed, trying legacy endpoint: {e}")

        # legacy query
        url = f"{self.base_url}/task/openapi/outputs"
        resp = self.session.post(
            url,
            json={"apiKey": self.api_key, "taskId": str(task_id)},
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        return self._unwrap(resp.json())

    def wait_for_completion(
        self,
        task_id: str,
        check_interval: int = 10,
        max_wait_time: int = 3600,
    ) -> Dict[str, Any]:
        """Poll until SUCCESS/FAILED. Returns a normalized result dict."""
        start_time = time.time()

        while time.time() - start_time < max_wait_time:
            try:
                data = self.query_task(task_id)
                status = data.get("status")

                if status == "SUCCESS":
                    logger.info(f"RunningHub task {task_id} succeeded")
                    return {"status": "COMPLETED", "data": data, "task_id": task_id}
                if status == "FAILED":
                    err = data.get("errorMessage") or data.get("failedReason") or "Task failed"
                    logger.error(f"RunningHub task {task_id} failed: {err}")
                    return {"status": "FAILED", "error": str(err), "task_id": task_id}
                if status in ("QUEUED", "RUNNING", "PENDING", None):
                    time.sleep(check_interval)
                else:
                    logger.warning(f"RunningHub unknown status: {status}")
                    return {"status": "UNKNOWN", "data": data, "task_id": task_id}
            except RunningHubError as e:
                logger.error(f"RunningHub query error: {e}")
                time.sleep(check_interval)
            except requests.exceptions.RequestException as e:
                logger.error(f"RunningHub query request failed: {e}")
                time.sleep(check_interval)

        return {"status": "TIMEOUT", "task_id": task_id}

    # ── results ───────────────────────────────────────────────────────────────

    @staticmethod
    def extract_result_urls(task_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Pull [{url, nodeId, outputType, text}] out of task data."""
        results = task_data.get("results") or []
        return [r for r in results if isinstance(r, dict) and r.get("url")]

    def download_file(self, url: str, output_path: str) -> bool:
        """Download a result url to a local path."""
        try:
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            with requests.get(url, stream=True, timeout=600) as resp:
                resp.raise_for_status()
                with open(output_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            f.write(chunk)
            logger.info(f"Downloaded RunningHub result: {output_path}")
            return True
        except Exception as e:
            logger.error(f"Result download failed: {e}")
            return False
