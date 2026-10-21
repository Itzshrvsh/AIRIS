"""
airis_config.py — Python-side access to AIRIS's single AI configuration.

Python automation scripts (browser control, visual element finding) read the
SAME provider configuration the Electron app stores in data/ai-config.json
(managed by js-files/aiConfig.js + the AI Settings screen). Changing the
provider, endpoint, key or model in AI Settings applies to Python too.

Requests use the OpenAI-compatible REST format:
    POST {baseURL}/chat/completions
so any compatible local or hosted endpoint (Ollama /v1, LM Studio, llama.cpp,
vLLM, OpenAI, ...) works without script changes.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "data" / "ai-config.json"

DEFAULTS: Dict[str, Any] = {
    "provider": "openai-compatible",
    "baseURL": "http://localhost:11434/v1",
    "apiKey": "",
    "model": "llava",
    "timeoutMs": 120000,
    "temperature": None,
    "maxTokens": None,
    "featureModels": {"vision": "", "summarizer": "", "fast": "", "transcription": "whisper"},
}


def normalize_base_url(raw: str) -> str:
    """Mirror of js-files/aiConfig.normalizeBaseURL: trims, collapses /v1 dupes."""
    base = (raw or "").strip()
    if not base:
        return DEFAULTS["baseURL"]
    if "://" not in base:
        base = "http://" + base
    # collapse duplicated /v1 segments
    while base.rstrip("/").lower().endswith("/v1/v1"):
        base = base.rstrip("/")[: -len("/v1")]
    return base.rstrip("/")


def load_ai_config() -> Dict[str, Any]:
    """Read the central config, never raising: missing/corrupt → defaults."""
    cfg: Dict[str, Any] = dict(DEFAULTS)
    try:
        if CONFIG_PATH.exists():
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                for key in ("provider", "baseURL", "apiKey", "model"):
                    if isinstance(data.get(key), str) and data[key].strip():
                        cfg[key] = data[key]
                if isinstance(data.get("timeoutMs"), (int, float)) and data["timeoutMs"] > 0:
                    cfg["timeoutMs"] = float(data["timeoutMs"])
                if isinstance(data.get("temperature"), (int, float)):
                    cfg["temperature"] = float(data["temperature"])
                if isinstance(data.get("maxTokens"), (int, float)) and data["maxTokens"] > 0:
                    cfg["maxTokens"] = float(data["maxTokens"])
                features = data.get("featureModels")
                if isinstance(features, dict):
                    for k in cfg["featureModels"]:
                        v = features.get(k)
                        if isinstance(v, str) and v.strip():
                            cfg["featureModels"][k] = v.strip()
    except Exception as err:  # missing file, bad JSON, etc. → defaults
        print(f"⚠️ ai-config.json unreadable ({err.__class__.__name__}); using defaults", file=sys.stderr)
    cfg["baseURL"] = normalize_base_url(cfg["baseURL"])
    return cfg


def _auth_headers(cfg: Dict[str, Any]) -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    key = (cfg.get("apiKey") or "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _resolve_model(cfg: Dict[str, Any], feature: Optional[str] = None) -> str:
    if feature:
        override = (cfg.get("featureModels") or {}).get(feature)
        if override and override.strip():
            return override.strip()
    return cfg["model"]


def _friendly_error(err: Exception, url: str) -> str:
    if isinstance(err, requests.exceptions.ConnectionError):
        return f"Could not reach {url} — is the AI server running? ({err.__class__.__name__})"
    if isinstance(err, requests.exceptions.Timeout):
        return f"Timed out contacting {url}."
    return f"{err.__class__.__name__}: {err}"


def chat(
    prompt: str,
    *,
    feature: Optional[str] = None,
    image_b64: Optional[str] = None,
    image_mime: str = "image/png",
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    timeout_s: float = 120.0,
) -> Tuple[Optional[str], Optional[str]]:
    """Ask the configured model. Returns (content, error) — one is always None."""
    cfg = load_ai_config()
    url = cfg["baseURL"].rstrip("/") + "/chat/completions"
    chosen = model or _resolve_model(cfg, feature)
    if not chosen:
        return None, "No model configured. Open AIRIS AI Settings and pick a model."

    body: Dict[str, Any] = {
        "model": chosen,
        "messages": [],
        "stream": False,
    }
    if image_b64:
        body["messages"].append(
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{image_b64}"}},
                ],
            }
        )
    else:
        body["messages"].append({"role": "user", "content": prompt})

    effective_temp = temperature if temperature is not None else cfg.get("temperature")
    if effective_temp is not None:
        body["temperature"] = effective_temp
    effective_max = max_tokens if max_tokens is not None else cfg.get("maxTokens")
    if effective_max is not None:
        body["max_tokens"] = int(effective_max)

    try:
        res = requests.post(url, json=body, headers=_auth_headers(cfg), timeout=timeout_s)
        if res.status_code in (401, 403):
            return None, f"Authentication failed (HTTP {res.status_code}) at {url}. Check the API key in AI Settings."
        if res.status_code == 404:
            return None, f"HTTP 404 at {url} — verify the base URL ends with /v1 and the model id exists."
        res.raise_for_status()
        data = res.json()
        content = (
            data.get("choices", [{}])[0].get("message", {}).get("content")
            or data.get("choices", [{}])[0].get("text")
            if isinstance(data, dict)
            else None
        )
        if content is None:
            return None, "The server returned no content for the chat request."
        return str(content), None
    except requests.exceptions.HTTPError as err:
        return None, f"HTTP error from {url}: {_safe_status_text(err) or err}"
    except Exception as err:
        return None, _friendly_error(err, url)


def _safe_status_text(err: requests.exceptions.HTTPError) -> str:
    try:
        if err.response is not None:
            return f"HTTP {err.response.status_code} {err.response.reason}"
    except Exception:
        pass
    return ""


def vision(prompt: str, screenshot_b64: str) -> Tuple[Optional[str], Optional[str]]:
    """Screen-understanding helper used by the browser automation planners."""
    return chat(prompt, feature="vision", image_b64=screenshot_b64)
