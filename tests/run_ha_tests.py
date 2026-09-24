"""Run each real HA instance in a fresh interpreter, including normal shutdown."""

import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def cases(suite):
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            yield from cases(test)
        else:
            yield test.id()


suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"), pattern="test_*.py")
for name in cases(suite):
    # HA and its C extensions are process-scoped, not restartable event-loop fixtures.
    result = subprocess.run(
        [sys.executable, "-X", "faulthandler", "-m", "unittest", name, "-v"],
        cwd=ROOT / "tests",
        env={**os.environ, "PYTHONPATH": str(ROOT)},
        check=False,
    )
    if result.returncode:
        raise SystemExit(f"{name}: interpreter exited with {result.returncode}")
