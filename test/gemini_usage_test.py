#!/usr/bin/env python3
"""Unit tests for bin/gemini-usage's omp fallback. No network, no omp calls.

Run: python3 -I test/gemini_usage_test.py
"""

import importlib.machinery
import importlib.util
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
loader = importlib.machinery.SourceFileLoader("gemini_usage", os.path.join(ROOT, "bin", "gemini-usage"))
spec = importlib.util.spec_from_loader("gemini_usage", loader)
g = importlib.util.module_from_spec(spec)
loader.exec_module(g)

count = 0


def test(fn):
  global count
  fn()
  count += 1


def omp_db(tmp, provider="antigravity-cli", disabled=None):
  path = Path(tmp) / "agent.db"
  conn = sqlite3.connect(path)
  conn.execute("CREATE TABLE auth_credentials (provider TEXT, credential_type TEXT, data TEXT, disabled_cause TEXT)")
  conn.execute("INSERT INTO auth_credentials VALUES (?, 'oauth', '{}', ?)", (provider, disabled))
  conn.commit()
  conn.close()
  return path


class Ran:
  def __init__(self, stdout, code=0):
    self.stdout, self.returncode, self.calls = stdout, code, 0

  def __call__(self, *args, **kwargs):
    self.calls += 1
    assert kwargs.get("stdin") == subprocess.DEVNULL  # never waits for input
    return self


GOOD = "ya29." + "a" * 200


@test
def omp_counts_only_an_enabled_antigravity_cli_sign_in():
  with tempfile.TemporaryDirectory() as tmp:
    assert g.omp_signed_in(omp_db(tmp)) is True
  with tempfile.TemporaryDirectory() as tmp:
    assert g.omp_signed_in(omp_db(tmp, provider="openai-codex")) is False
  with tempfile.TemporaryDirectory() as tmp:
    assert g.omp_signed_in(omp_db(tmp, disabled="revoked")) is False
  assert g.omp_signed_in(Path("/nonexistent/agent.db")) is False


@test
def omp_is_never_run_without_its_sign_in():
  # On a fresh Omarchy machine `omp` is a lazy-install shim: calling it
  # would download ~300 MB. No sign-in in omp's database, no call.
  os.environ["AGENT_USAGE_OMP_DB"] = "/nonexistent/agent.db"
  ran = Ran(GOOD)
  assert g.omp_token(run=ran) is None and ran.calls == 0


@test
def omp_token_is_validated():
  with tempfile.TemporaryDirectory() as tmp:
    os.environ["AGENT_USAGE_OMP_DB"] = str(omp_db(tmp))
    if not g.shutil.which("omp"):
      return  # no omp on this machine: nothing more to check
    assert g.omp_token(run=Ran(GOOD + "\n")) == GOOD
    assert g.omp_token(run=Ran("Error: not signed in")) is None
    assert g.omp_token(run=Ran(GOOD, code=1)) is None
    assert g.omp_token(run=Ran("ya29.<script>")) is None


print(f"gemini tests: {count} passed")
