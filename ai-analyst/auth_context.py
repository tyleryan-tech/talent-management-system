"""
auth_context.py — 验证主系统签发的 AI Analyst 会话上下文。

Token 格式由 Node 后端 `/api/ai-analyst/session` 签发：
base64url(JSON payload).base64url(HMAC-SHA256(payload, secret))
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any


def _b64decode(data: str) -> bytes:
    try:
        pad = "=" * (-len(data) % 4)
        return base64.urlsafe_b64decode((data + pad).encode("ascii"))
    except Exception as exc:
        raise PermissionError("AI 分析会话格式无效。") from exc


def verify_context_token(token: str, secret: str) -> dict[str, Any]:
    if not token:
        raise PermissionError("缺少 AI 分析会话，请从主系统进入。")
    if not secret:
        raise PermissionError("AI 分析会话密钥未配置，请联系管理员。")
    try:
        payload_b64, sig = token.split(".", 1)
    except ValueError as exc:
        raise PermissionError("AI 分析会话格式无效。") from exc

    expected = hmac.new(
        secret.encode("utf-8"),
        payload_b64.encode("ascii"),
        hashlib.sha256,
    ).digest()
    actual = _b64decode(sig)
    if not hmac.compare_digest(expected, actual):
        raise PermissionError("AI 分析会话校验失败。")

    try:
        payload = json.loads(_b64decode(payload_b64).decode("utf-8"))
    except Exception as exc:
        raise PermissionError("AI 分析会话内容无法解析。") from exc

    if payload.get("aud") != "ai-analyst":
        raise PermissionError("AI 分析会话受众无效。")
    exp = int(payload.get("exp") or 0)
    if exp <= int(time.time()):
        raise PermissionError("AI 分析会话已过期，请刷新主系统页面后重试。")
    modules = ((payload.get("permissions") or {}).get("modules") or [])
    if "ai_analyst" not in modules:
        raise PermissionError("当前账号无 AI 数据分析权限。")
    return payload


def context_label(context: dict[str, Any] | None) -> str:
    if not context:
        return ""
    user = context.get("user") or {}
    line = context.get("productLine") or {}
    perms = context.get("permissions") or {}
    parts = []
    if user.get("realName") or user.get("username"):
        parts.append(str(user.get("realName") or user.get("username")))
    if line.get("name"):
        parts.append(f"产品线：{line['name']}")
    if perms.get("scope"):
        parts.append(f"范围：{perms['scope']}")
    return " · ".join(parts)
