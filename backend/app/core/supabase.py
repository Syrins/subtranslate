"""Lightweight Supabase client using httpx (no heavy SDK dependency)."""

import httpx
from functools import lru_cache
from typing import Any, Optional
from app.core.config import get_settings


class SupabaseTable:
    """Chainable query builder for a single table."""

    def __init__(self, client: "SupabaseClient", table: str):
        self._client = client
        self._table = table
        self._params: dict[str, str] = {}
        self._headers: dict[str, str] = {}
        self._count_mode: Optional[str] = None
        self._single = False
        self._maybe_single = False

    def select(self, columns: str = "*", count: Optional[str] = None) -> "SupabaseTable":
        self._params["select"] = columns
        self._method = "GET"
        if count:
            self._count_mode = count
            self._headers["Prefer"] = f"count={count}"
        return self

    def insert(self, data: dict | list[dict]) -> "SupabaseTable":
        self._method = "POST"
        self._body = data
        self._headers["Prefer"] = "return=representation"
        return self

    def update(self, data: dict) -> "SupabaseTable":
        self._method = "PATCH"
        self._body = data
        self._headers["Prefer"] = "return=representation"
        return self

    def upsert(self, data: dict | list[dict]) -> "SupabaseTable":
        self._method = "POST"
        self._body = data
        self._headers["Prefer"] = "return=representation,resolution=merge-duplicates"
        return self

    def delete(self) -> "SupabaseTable":
        self._method = "DELETE"
        self._headers["Prefer"] = "return=representation"
        return self

    def eq(self, column: str, value: Any) -> "SupabaseTable":
        self._params[column] = f"eq.{value}"
        return self

    def neq(self, column: str, value: Any) -> "SupabaseTable":
        self._params[column] = f"neq.{value}"
        return self

    def lt(self, column: str, value: Any) -> "SupabaseTable":
        self._params[column] = f"lt.{value}"
        return self

    def lte(self, column: str, value: Any) -> "SupabaseTable":
        self._params[column] = f"lte.{value}"
        return self

    def gt(self, column: str, value: Any) -> "SupabaseTable":
        self._params[column] = f"gt.{value}"
        return self

    def gte(self, column: str, value: Any) -> "SupabaseTable":
        self._params[column] = f"gte.{value}"
        return self

    def ilike(self, column: str, pattern: str) -> "SupabaseTable":
        self._params[column] = f"ilike.{pattern}"
        return self

    def is_(self, column: str, value: Any) -> "SupabaseTable":
        self._params[column] = f"is.{value}"
        return self

    def in_(self, column: str, values: list) -> "SupabaseTable":
        vals = ",".join(str(v) for v in values)
        self._params[column] = f"in.({vals})"
        return self

    def or_(self, filters: str) -> "SupabaseTable":
        self._params["or"] = f"({filters})"
        return self

    def order(self, column: str, desc: bool = False) -> "SupabaseTable":
        direction = "desc" if desc else "asc"
        self._params["order"] = f"{column}.{direction}"
        return self

    def limit(self, count: int) -> "SupabaseTable":
        self._headers["Range"] = f"0-{count - 1}"
        self._headers["Range-Unit"] = "items"
        return self

    def range(self, start: int, end: int) -> "SupabaseTable":
        self._headers["Range"] = f"{start}-{end}"
        self._headers["Range-Unit"] = "items"
        return self

    def single(self) -> "SupabaseTable":
        self._headers["Accept"] = "application/vnd.pgrst.object+json"
        # Allow 0-or-1 row responses without throwing 406 on newer PostgREST
        prefer = self._headers.get("Prefer")
        if prefer and "plurality=singular" not in prefer:
            self._headers["Prefer"] = prefer + ",plurality=singular"
        elif not prefer:
            self._headers["Prefer"] = "plurality=singular"
        self._single = True
        return self

    def maybeSingle(self) -> "SupabaseTable":
        self._headers["Accept"] = "application/vnd.pgrst.object+json"
        # Allow 0-or-1 row responses without throwing 406 on newer PostgREST
        prefer = self._headers.get("Prefer")
        if prefer and "plurality=singular" not in prefer:
            self._headers["Prefer"] = prefer + ",plurality=singular"
        elif not prefer:
            self._headers["Prefer"] = "plurality=singular"
        self._single = True
        self._maybe_single = True
        return self

    def execute(self) -> "SupabaseResponse":
        url = f"{self._client.rest_url}/{self._table}"
        headers = {**self._client.headers, **self._headers}
        method = getattr(self, "_method", "GET")
        body = getattr(self, "_body", None)
        http = self._client.http

        if method == "GET":
            resp = http.get(url, params=self._params, headers=headers)
        elif method == "POST":
            resp = http.post(url, params=self._params, headers=headers, json=body)
        elif method == "PATCH":
            resp = http.patch(url, params=self._params, headers=headers, json=body)
        elif method == "DELETE":
            resp = http.delete(url, params=self._params, headers=headers)
        else:
            raise ValueError(f"Unknown method: {method}")

        # single/maybeSingle: return None data instead of raising on 406
        if resp.status_code == 406 and (getattr(self, "_maybe_single", False) or getattr(self, "_single", False)):
            return SupabaseResponse(data=None, count=0)

        if resp.status_code >= 400:
            raise RuntimeError(f"Supabase error {resp.status_code}: {resp.text[:300]}")

        data = resp.json() if resp.text else None
        count = None
        content_range = resp.headers.get("content-range")
        if content_range and "/" in content_range:
            total = content_range.split("/")[-1]
            count = int(total) if total != "*" else None

        return SupabaseResponse(data=data, count=count)


class SupabaseResponse:
    def __init__(self, data: Any = None, count: Optional[int] = None):
        self.data = data
        self.count = count


class SupabaseStorage:
    """Minimal storage client for upload/download/delete."""

    def __init__(self, client: "SupabaseClient"):
        self._client = client

    def from_(self, bucket: str) -> "SupabaseBucket":
        return SupabaseBucket(self._client, bucket)


class SupabaseBucket:
    def __init__(self, client: "SupabaseClient", bucket: str):
        self._client = client
        self._bucket = bucket

    def upload(self, path: str, data: bytes, content_type: str = "application/octet-stream") -> dict:
        url = f"{self._client.storage_url}/object/{self._bucket}/{path}"
        headers = {**self._client.headers, "Content-Type": content_type}
        resp = self._client.http_long.post(url, content=data, headers=headers)
        if resp.status_code >= 400:
            raise RuntimeError(f"Storage upload error: {resp.text[:300]}")
        return resp.json() if resp.text else {}

    def download(self, path: str) -> bytes:
        url = f"{self._client.storage_url}/object/{self._bucket}/{path}"
        resp = self._client.http_long.get(url, headers=self._client.headers)
        if resp.status_code >= 400:
            raise RuntimeError(f"Storage download error: {resp.text[:300]}")
        return resp.content

    def remove(self, paths: list[str]) -> dict:
        url = f"{self._client.storage_url}/object/{self._bucket}"
        resp = self._client.http.delete(url, headers=self._client.headers, json={"prefixes": paths})
        if resp.status_code >= 400:
            raise RuntimeError(f"Storage remove error: {resp.text[:300]}")
        return resp.json() if resp.text else {}

    def create_signed_url(self, path: str, expires_in: int = 3600) -> dict:
        url = f"{self._client.storage_url}/object/sign/{self._bucket}/{path}"
        resp = self._client.http.post(url, headers=self._client.headers, json={"expiresIn": expires_in})
        if resp.status_code >= 400:
            raise RuntimeError(f"Signed URL error: {resp.text[:300]}")
        return resp.json() if resp.text else {}


class SupabaseAuth:
    """Minimal auth admin client."""

    def __init__(self, client: "SupabaseClient"):
        self._client = client
        self.admin = SupabaseAuthAdmin(client)


class _AuthUserObj:
    """Lightweight user object returned by auth endpoints."""
    __slots__ = ("id", "email", "user")

    def __init__(self, d: dict):
        self.id = d.get("id")
        self.email = d.get("email")
        self.user = self


class _AuthUserResp:
    """Wrapper matching supabase-py's auth response shape."""
    __slots__ = ("user",)

    def __init__(self, d: dict):
        self.user = _AuthUserObj(d)


class SupabaseAuthAdmin:
    def __init__(self, client: "SupabaseClient"):
        self._client = client

    def get_user(self, token: str) -> Optional[_AuthUserResp]:
        """Verify a JWT and get user info."""
        url = f"{self._client.auth_url}/user"
        headers = {**self._client.headers, "Authorization": f"Bearer {token}"}
        resp = self._client.http.get(url, headers=headers)
        if resp.status_code >= 400:
            return None
        return _AuthUserResp(resp.json())

    def get_user_by_id(self, user_id: str) -> Optional[_AuthUserResp]:
        """Admin: get user by ID."""
        url = f"{self._client.auth_url}/admin/users/{user_id}"
        resp = self._client.http.get(url, headers=self._client.headers)
        if resp.status_code >= 400:
            return None
        return _AuthUserResp(resp.json())

    def delete_user(self, user_id: str) -> bool:
        url = f"{self._client.auth_url}/admin/users/{user_id}"
        resp = self._client.http.delete(url, headers=self._client.headers)
        if resp.status_code >= 400:
            raise RuntimeError(f"Delete user failed: {resp.text[:200]}")
        return True


class SupabaseClient:
    """Lightweight Supabase client using httpx with persistent connection pool."""

    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key
        self.rest_url = f"{self.url}/rest/v1"
        self.storage_url = f"{self.url}/storage/v1"
        self.auth_url = f"{self.url}/auth/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        # Persistent connection pools (thread-safe)
        self.http = httpx.Client(
            timeout=30,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
        # Separate pool for long operations (upload/download)
        self.http_long = httpx.Client(
            timeout=600,
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
        self.storage = SupabaseStorage(self)
        self.auth = SupabaseAuth(self)

    def table(self, name: str) -> SupabaseTable:
        return SupabaseTable(self, name)

    def rpc(self, function_name: str, params: dict | None = None) -> SupabaseResponse:
        url = f"{self.rest_url}/rpc/{function_name}"
        resp = self.http.post(url, headers=self.headers, json=params or {})
        if resp.status_code >= 400:
            raise RuntimeError(f"RPC error: {resp.text[:300]}")
        return SupabaseResponse(data=resp.json() if resp.text else None)


_admin_client: Optional[SupabaseClient] = None


def get_supabase_admin() -> SupabaseClient:
    """Service role client - bypasses RLS, use for backend operations only."""
    global _admin_client
    if _admin_client is None:
        settings = get_settings()
        _admin_client = SupabaseClient(settings.supabase_url, settings.supabase_service_role_key)
    return _admin_client
