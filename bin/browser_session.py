"""Sign-ins kept in a browser profile of the plugin's own.

Some subscriptions have no CLI that keeps a sign-in (Suno). For those,
`bin/browser-signin <id> <url>` opens a Chromium window on
$XDG_STATE_HOME/subscription-usage/profiles/<id>, started with
--password-store=basic, and you sign in there as on any site (Google sign-in
included). This module reads that profile's cookies; nothing is copied out of
it or written anywhere else.

Also here: the two requests to a Clerk-hosted sign-in (Suno uses Clerk) that
turn the long-lived `__client` cookie into a short-lived bearer token.

Standard library only, plus the `openssl` command for AES.
"""

import base64
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) subscription-usage"
JWT = re.compile(r"^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,8192}\.[A-Za-z0-9_-]{8,4096}$")
SESSION_ID = re.compile(r"^sess(ion)?_[A-Za-z0-9]{1,64}$")
PROVIDER_ID = re.compile(r"^[a-z0-9-]{1,32}$")


class SignedOut(Exception):
  """No usable sign-in: the panel should offer Sign in."""


def state_dir():
  base = os.environ.get("XDG_STATE_HOME") or os.path.join(os.path.expanduser("~"), ".local", "state")
  return Path(base) / "subscription-usage"


def profile_dir(provider):
  if not PROVIDER_ID.match(provider):
    raise ValueError("bad provider id")
  return state_dir() / "profiles" / provider


# ---- Cookies --------------------------------------------------------------

# Chromium on Linux with --password-store=basic encrypts cookie values with a
# fixed key ("v10" values); keyring-backed values ("v11") cannot be read here,
# which is why browser-signin always starts the profile with that flag.
_V10_KEY = hashlib.pbkdf2_hmac("sha1", b"peanuts", b"saltysalt", 1, 16)
_IV = b" " * 16


def aes_cbc_decrypt(key, data):
  out = subprocess.run(["openssl", "enc", "-d", "-aes-128-cbc", "-K", key.hex(), "-iv", _IV.hex()],
                       input=data, capture_output=True, timeout=10)
  if out.returncode != 0:
    raise ValueError("cookie did not decrypt")
  return out.stdout


def decrypt_cookie(encrypted, host_key, db_version):
  if not encrypted:
    return None
  if encrypted[:3] != b"v10":
    return None
  plain = aes_cbc_decrypt(_V10_KEY, encrypted[3:])
  # Since cookie DB version 24, Chromium prefixes the value with
  # SHA-256(host_key) to bind it to its domain.
  if db_version >= 24 and plain[:32] == hashlib.sha256(host_key.encode()).digest():
    plain = plain[32:]
  return plain.decode("utf-8")


def read_cookie(profile, host, name):
  """The cookie `name` set for `host` (or `.host`) in a Chromium profile."""
  db = Path(profile) / "Default" / "Cookies"
  if not db.is_file():
    return None
  # immutable: read without taking locks, so an open sign-in window is fine.
  conn = sqlite3.connect(f"file:{db}?immutable=1", uri=True)
  try:
    row = conn.execute("SELECT value FROM meta WHERE key = 'version'").fetchone()
    version = int(row[0]) if row else 0
    rows = conn.execute(
      "SELECT host_key, value, encrypted_value FROM cookies WHERE name = ? AND host_key IN (?, ?) "
      "ORDER BY expires_utc DESC", (name, host, "." + host)).fetchall()
  finally:
    conn.close()
  for host_key, value, encrypted in rows:
    if value:
      return value
    try:
      plain = decrypt_cookie(bytes(encrypted), host_key, version)
    except (ValueError, UnicodeDecodeError, OSError, subprocess.SubprocessError):
      plain = None
    if plain:
      return plain
  return None


def jwt_claims(token):
  if not isinstance(token, str) or not JWT.match(token):
    return None
  part = token.split(".")[1]
  try:
    claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
  except (ValueError, json.JSONDecodeError):
    return None
  return claims if isinstance(claims, dict) else None


# ---- HTTP and Clerk -------------------------------------------------------

def request(method, url, headers=None, timeout=20):
  """(status, parsed JSON or None). Never raises for HTTP errors."""
  req = urllib.request.Request(url, method=method, headers=dict({"User-Agent": USER_AGENT, "Accept": "application/json"}, **(headers or {})))
  try:
    with urllib.request.urlopen(req, timeout=timeout) as resp:
      status, body = resp.status, resp.read(4 << 20)
  except urllib.error.HTTPError as err:
    status, body = err.code, err.read(65536)
  try:
    return status, json.loads(body)
  except (ValueError, UnicodeDecodeError):
    return status, None


def clerk_token(auth_origin, app_origin, client_cookie):
  """A fresh session token from a Clerk sign-in, given its `__client` cookie."""
  headers = {"Cookie": "__client=" + client_cookie, "Origin": app_origin}
  status, body = request("GET", auth_origin + "/v1/client", headers)
  if status in (401, 403):
    raise SignedOut
  client = body.get("response") if isinstance(body, dict) else None
  if not isinstance(client, dict):
    raise SignedOut
  sid = str(client.get("last_active_session_id") or "")
  if not SESSION_ID.match(sid):
    raise SignedOut
  status, body = request("POST", f"{auth_origin}/v1/client/sessions/{sid}/tokens", headers)
  if status in (401, 403, 404):
    raise SignedOut
  token = body.get("jwt") if isinstance(body, dict) else None
  if not jwt_claims(token):
    raise RuntimeError(f"no token from the sign-in service (HTTP {status})")
  return token
