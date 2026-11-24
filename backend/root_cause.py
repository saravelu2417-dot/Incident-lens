from bisect import bisect_left, bisect_right
from collections import defaultdict
from datetime import datetime
import re

from .anomaly import detect
from .classification import classify, SIGNALS
from .recommendations import STEPS

CAUSES = {
    "Database Failure": ("database", "Database connectivity or query failure"),
    "Network Issue": ("network", "Network or upstream connectivity failure"),
    "Authentication Failure": ("auth", "Authentication or credential rejection"),
    "Memory Issue": ("memory", "Memory pressure or heap exhaustion"),
    "Application Error": ("application", "Application execution failure"),
}
THRESHOLDS = {"cpu": (90, "%"), "memory": (90, "%"), "latency": (1000, "ms")}


def hypotheses(row):
    result = []
    for category, (key, title) in CAUSES.items():
        match = re.search(SIGNALS[category], row["message"], re.I)
        if match:
            result.append((key, title, 0.60 if row["failure"] else 0.40,
                           f'Log references “{match.group()}” at level {row["level"]}.'))
    for key, title in (("cpu", "CPU saturation"), ("memory", "Memory pressure or heap exhaustion"),
                       ("latency", "Elevated request latency")):
        limit, unit = THRESHOLDS[key]
        if (row[key] or 0) >= limit:
            result.append((key, title, 0.58, f'{key.title()} measured {row[key]:g}{unit} (threshold {limit}{unit}).'))
    return result


def investigate(rows):
    rows = detect(rows)
    for row in rows:
        row["signals"] = hypotheses(row)
    dated = sorted((datetime.fromisoformat(row["timestamp"]).timestamp(), row["id"]) for row in rows if row["timestamp"])
    timestamps = [stamp for stamp, _ in dated]
    alerts = [row for row in rows if row["failure"] or row["anomaly"]
              or any((row[key] or 0) >= limit for key, (limit, _) in THRESHOLDS.items())]
    incidents = []
    for row, (category, classification_score, method) in zip(alerts, classify(alerts)):
        correlated = []
        if row["timestamp"]:
            stamp = datetime.fromisoformat(row["timestamp"]).timestamp()
            left = bisect_left(timestamps, stamp - 300)
            right = bisect_right(timestamps, stamp + 300)
            end = bisect_right(timestamps, stamp)
            nearby = list(reversed(dated[max(left, end - 60):end])) + dated[end:min(right, end + 30)]
            correlated = [rows[row_id - 1] for _, row_id in nearby if row_id != row["id"]]
        ranked = defaultdict(lambda: {"confidence": 0, "evidence": []})
        for event in [row, *correlated]:
            same_service = event["service"] == row["service"] != "Unknown service"
            if event is row:
                weight = 1
            elif same_service:
                weight = 0.65
            else:
                weight = 0.25
            if event is not row and event["timestamp"] > row["timestamp"]:
                weight *= 0.55
            for key, title, score, evidence in event["signals"]:
                cause = ranked[key]
                cause.update(key=key, title=title)
                if len(cause["evidence"]) < 5:
                    cause["confidence"] += score * weight * (1 if not cause["evidence"] else 0.20)
                    cause["evidence"].append(f'Log #{event["id"]} · {event["service"]}. {evidence}')
        causes = sorted(ranked.values(), key=lambda cause: cause["confidence"], reverse=True)[:4]
        for cause in causes:
            cause["confidence"] = round(min(0.95, cause["confidence"]), 2)
        if not causes:
            causes = [{"key": "unknown", "title": "Insufficient evidence to infer a cause",
                       "confidence": None, "evidence": [f'Log #{row["id"]} · {row["level"]}. {row["message"]}'.strip()]}]
        severity = ("Critical" if row["level"] == "CRITICAL" or
                    (row["failure"] and (row["memory"] or 0) >= 98) else
                    "High" if row["failure"] else
                    "Medium" if row["signals"] or row["level"] in {"WARNING", "MEDIUM"} else "Low")
        neighbors = sorted(correlated, key=lambda event: (not event["failure"], event["service"] != row["service"]))[:11]
        timeline = sorted([row, *neighbors], key=lambda event: (event["timestamp"] or "", event["id"]))
        incidents.append({
            "log_id": row["id"], "timestamp": row["timestamp"], "service": row["service"],
            "category": category, "classification_score": classification_score, "classification_method": method,
            "severity": severity, "message": row["message"], "status": "Open",
            "anomaly": row["anomaly"], "anomaly_score": row["anomaly_score"], "recurrences": row["recurrences"],
            "causes": causes, "recommendations": STEPS[causes[0]["key"]],
            "timeline": [{key: event[key] for key in ("id", "timestamp", "service", "level", "message")}
                         for event in timeline],
        })
    for row in rows:
        del row["signals"]
    return rows, incidents
