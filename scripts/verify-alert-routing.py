#!/usr/bin/env python3
"""Read-only routing regression matrix using Alertmanager's own matcher.

Run on RS1000 with kubectl access. No alerts or messages are sent. The test reads
the running Alertmanager configuration in its Pod and never exports receivers'
credentials. Exit nonzero if any expected receiver set differs.
"""
import json
from pathlib import Path
import subprocess
import sys


def main():
    cases = json.loads((Path(__file__).resolve().parents[1] /
                        "infra/monitoring/alert-routing-cases.json").read_text())
    failures = 0
    for case in cases:
        command = [
            "kubectl", "-n", "monitoring", "exec",
            "alertmanager-monitoring-kube-prometheus-alertmanager-0",
            "-c", "alertmanager", "--", "amtool",
            "--alertmanager.url=http://127.0.0.1:9093",
            "config", "routes", "test",
            "--verify.receivers=" + ",".join(case["receivers"]),
            *[f"{key}={value}" for key, value in case["labels"].items()],
        ]
        label = ",".join(f"{key}={value}" for key, value in case["labels"].items())
        try:
            result = subprocess.run(command, capture_output=True, timeout=30, check=False)
            passed = result.returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            passed = False
        # Do not echo subprocess diagnostics: keep output free of configuration.
        print(f"{'PASS' if passed else 'FAIL'} {label} -> {','.join(case['receivers'])}")
        failures += not passed
    print(f"{len(cases) - failures}/{len(cases)} routing cases passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
