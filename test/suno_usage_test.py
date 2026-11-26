#!/usr/bin/env python3
"""Unit tests for bin/suno-usage and bin/browser_session.py. No network.

Run: python3 test/suno_usage_test.py
"""

import hashlib
import importlib.machinery
import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "bin"))
import browser_session as bs  # noqa: E402

loader = importlib.machinery.SourceFileLoader("suno_usage", os.path.join(ROOT, "bin", "suno-usage"))
spec = importlib.util.spec_from_loader("suno_usage", loader)
suno = importlib.util.module_from_spec(spec)
loader.exec_module(suno)

NOW = 1795700000.0  # 2026-11-26T09:33:20Z
count = 0


def test(fn):
  global count
  fn()
  count += 1


# Made-up values in the shape suno.com/a/api/billing/info/ answers with.
INFO = {
  "subscription_id": "sub_SECRET", "payment_method_type": "card", "country_code": "US",
  "is_active": True, "is_past_due": False, "is_paused": False,
  "credits": 0, "period": "month", "monthly_usage": 500, "monthly_limit": 2500, "total_credits_left": 2000,
  "period_end": "2026-11-30T05:17:26Z", "renews_on": "2026-11-30T05:17:26Z",
  "visuals_credits_left": 200,
  "plan": {"id": "x", "plan_key": "pro", "name": "Pro Plan", "visuals_credits": 225},
  "models": [{"name": "v6", "can_use": True}, {"name": "v6-wild", "can_use": True}, {"name": "v9", "can_use": False}, {"name": "<b>", "can_use": True}],
  "download_usage": {"current_period_downloads_used": 3, "current_period_downloads_limit": 20},
}


@test
def builds_the_shared_record_shape():
  r = suno.build_record(INFO, NOW)
  head = r["limits"][0]
  assert head == {"label": "Monthly (credits)", "title": "Credits", "percent": 0.2, "resetsAt": "2026-11-30T05:17:26Z",
                  "windowStartsAt": "2026-10-30T05:17:26Z", "primary": True, "detail": "500 of 2,500 credits used"}, head
  assert [l["label"] for l in r["limits"]] == ["Monthly (credits)", "Visual credits", "Downloads"]
  assert r["limits"][1]["percent"] == round(25 / 225, 4)
  assert r["limits"][2]["detail"] == "3 of 20 used"
  assert r["plan"] == "Pro Plan" and r["tierLabel"] == "Pro"
  assert r["credits"] == {"monthlyLimit": 2500, "monthlyUsage": 500, "left": 2000, "extra": 0}
  assert r["planModels"] == ["v6", "v6-wild"]
  assert r["signInRequired"] is False and r["usageStatusText"] == ""


@test
def never_prints_account_or_payment_identifiers():
  text = json.dumps(suno.build_record(INFO, NOW))
  assert "sub_SECRET" not in text and '"card"' not in text
  # Field *names* are kept for the baseline check, values are not.
  assert "subscription_id" in suno.build_record(INFO, NOW)["sourceFields"]["billing"]


@test
def same_keys_signed_in_or_not():
  assert sorted(suno.build_record(INFO, NOW)) == sorted(suno.empty_record())


@test
def extra_credits_and_status_flags():
  r = suno.build_record(dict(INFO, credits=500, is_paused=True), NOW)
  assert r["limits"][0]["detail"] == "500 of 2,500 credits used · 500 extra"
  assert r["usageStatusText"] == "Subscription paused"


@test
def daily_period_and_bad_values():
  r = suno.build_record(dict(INFO, period="day", period_end="2026-11-27T00:00:00Z", monthly_limit=50, monthly_usage=10), NOW)
  assert r["limits"][0]["label"] == "Daily (credits)"
  assert r["limits"][0]["windowStartsAt"] == "2026-11-26T00:00:00Z"
  bad = suno.build_record(dict(INFO, monthly_limit="lots", period_end="soon", renews_on=None), NOW)
  assert bad["limits"][0]["label"] == "Visual credits" and bad["limits"][0]["resetsAt"] == ""


@test
def month_before_clamps_short_months():
  from datetime import datetime, timezone
  assert suno.month_before(datetime(2026, 3, 31, tzinfo=timezone.utc)).day == 28
  assert suno.month_before(datetime(2026, 1, 15, tzinfo=timezone.utc)).month == 12


@test
def reads_a_chromium_v10_cookie():
  with tempfile.TemporaryDirectory() as tmp:
    os.makedirs(os.path.join(tmp, "Default"))
    host = ".auth.suno.com"
    plain = hashlib.sha256(host.encode()).digest() + b"client-cookie-value"
    enc = subprocess.run(["openssl", "enc", "-aes-128-cbc", "-K", bs._V10_KEY.hex(), "-iv", bs._IV.hex()],
                         input=plain, capture_output=True, check=True).stdout
    db = sqlite3.connect(os.path.join(tmp, "Default", "Cookies"))
    db.execute("CREATE TABLE meta (key TEXT, value TEXT)")
    db.execute("INSERT INTO meta VALUES ('version', '24')")
    db.execute("CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, expires_utc INTEGER)")
    db.execute("INSERT INTO cookies VALUES (?, '__client', '', ?, 1)", (host, b"v10" + enc))
    db.execute("INSERT INTO cookies VALUES ('auth.suno.com', '__client', '', ?, 0)", (b"v11whatever",))
    db.commit()
    db.close()
    assert bs.read_cookie(tmp, "auth.suno.com", "__client") == "client-cookie-value"
    assert bs.read_cookie(tmp, "auth.suno.com", "missing") is None
  assert bs.read_cookie("/nonexistent", "auth.suno.com", "__client") is None


@test
def token_cache_respects_expiry():
  import base64
  def jwt(exp):
    part = base64.urlsafe_b64encode(json.dumps({"exp": exp}).encode()).decode().rstrip("=")
    return "eyJhbGciOiJSUzI1NiJ9." + part + ".c2lnbmF0dXJlLXNpZw"
  with tempfile.TemporaryDirectory() as tmp:
    os.environ["XDG_STATE_HOME"] = tmp
    bs.store_token("suno", jwt(NOW + 3600))
    assert bs.cached_token("suno", NOW) is not None
    assert oct(os.stat(bs.cache_path("suno")).st_mode & 0o777) == "0o600"
    assert bs.cached_token("suno", NOW + 3550) is None  # inside the 2-minute margin
    bs.forget_token("suno")
    assert bs.cached_token("suno", NOW) is None
  assert bs.jwt_claims("not a jwt") is None


@test
def daily_history_charts_credits_per_day():
  h = {}
  suno.note_usage(h, "2026-11-24", 100, "P1")   # first day seen: only what was used while watching
  suno.note_usage(h, "2026-11-24", 130, "P1")
  suno.note_usage(h, "2026-11-25", 130, "P1")   # nothing used
  suno.note_usage(h, "2026-11-26", 200, "P1")
  assert suno.recent_days(h, "2026-11-26")[-3:] == [
    {"date": "2026-11-24", "messageCount": 30}, {"date": "2026-11-25", "messageCount": 0}, {"date": "2026-11-26", "messageCount": 70}]
  # Days before the history began are unknown, not zero.
  assert [r["messageCount"] for r in suno.recent_days(h, "2026-11-26")[:4]] == [None] * 4
  suno.note_usage(h, "2026-11-30", 20, "P2")    # new billing month
  assert suno.recent_days(h, "2026-11-30")[-1] == {"date": "2026-11-30", "messageCount": 20}
  for d in range(1, 20):
    suno.note_usage(h, f"2026-12-{d:02d}", d, "P2")
  assert len(h) == 14 and len(suno.recent_days(h, "2026-12-19")) == 7


@test
def history_is_written_beside_the_token_cache():
  from pathlib import Path
  with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "h.json"
    r = suno.with_history(suno.build_record(INFO, NOW), NOW, path)
    assert len(r["recentDays"]) == 7 and r["recentDays"][-1]["messageCount"] == 0
    assert r["recentDays"][0]["messageCount"] is None
    assert json.loads(path.read_text())[r["recentDays"][-1]["date"]]["last"] == 500
  assert suno.with_history(suno.empty_record(), NOW)["recentDays"] == []


@test
def rejects_unsafe_profile_ids():
  try:
    bs.profile_dir("../etc")
  except ValueError:
    return
  raise AssertionError("accepted a path in the provider id")


print(f"suno tests: {count} passed")
