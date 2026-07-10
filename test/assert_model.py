#!/usr/bin/env python3
"""Assert on the model embedded in a rendered fp-report HTML file.

Usage: assert_model.py <html> <metric> <expected>
  metric: issues | open | blocked
Exits 0 if the computed value equals <expected>, else 1 (printing both).

Mirrors the template's derivation: OPEN = statuses whose role is "open";
a dependency is satisfied (MET) once its target is done/rejected; an open issue
with any unmet dependency is blocked.
"""
import sys, re, json

def load(path):
    html = open(path, encoding="utf-8").read()
    data = re.search(r'<script type="application/json" id="fp-data">(.*?)</script>', html, re.S).group(1)
    issues = json.loads(data.replace("\\u003c", "<"))["issues"]
    cfg = re.search(r'const STATUS_CONFIG = (\{.*?\});', html, re.S).group(1)
    statuses = json.loads(cfg.replace("\\u003c", "<"))["statuses"]
    return issues, statuses

def main():
    path, metric, expected = sys.argv[1], sys.argv[2], int(sys.argv[3])
    issues, statuses = load(path)
    OPEN = {s["key"] for s in statuses if s.get("role") == "open"}
    MET  = {s["key"] for s in statuses if s.get("role") in ("done", "rejected")}
    by_id = {i["id"]: i for i in issues}
    if metric == "issues":
        got = len(issues)
    elif metric == "open":
        got = sum(1 for i in issues if i["status"] in OPEN)
    elif metric == "blocked":
        got = sum(1 for i in issues if i["status"] in OPEN and
                  any((d in by_id) and by_id[d]["status"] not in MET for d in (i.get("dependencies") or [])))
    else:
        print(f"unknown metric: {metric}"); return 2
    if got != expected:
        print(f"{metric}: expected {expected}, got {got}")
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
