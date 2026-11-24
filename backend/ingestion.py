import io
import json
import math
import re
from pathlib import Path

import pandas as pd

FIELDS = {
    "timestamp": ("timestamp", "time", "datetime", "@timestamp", "date"),
    "service": ("service", "component", "logger", "application", "host"),
    "level": ("level", "severity", "log_level", "loglevel"),
    "message": ("message", "msg", "error", "error_message", "description", "event"),
    "latency": ("latency", "latency_ms", "response_time_ms", "response_time", "duration_ms"),
    "cpu": ("cpu", "cpu_percent", "cpu_usage", "cpu_pct"),
    "memory": ("memory", "memory_percent", "memory_usage", "memory_pct", "mem"),
}
METRICS = {
    "latency": r"\b(?:latency|response[ _]time|duration)(?:_ms)?\s*[:=]\s*(\d+(?:\.\d+)?)\s*(ms|s)?\b",
    "cpu": r"\bcpu(?:[ _](?:usage|percent|pct))?\s*[:=]\s*(\d+(?:\.\d+)?)\s*(%)?",
    "memory": r"\b(?:memory|mem)(?:[ _](?:usage|percent|pct))?\s*[:=]\s*(\d+(?:\.\d+)?)\s*(%)?",
}


def parse(name, data):
    content = data.decode("utf-8-sig")
    suffix = Path(name).suffix.lower()
    if suffix == ".csv":
        records = pd.read_csv(io.StringIO(content), dtype=str, keep_default_na=False).to_dict("records")
    elif suffix == ".json":
        try:
            records = json.loads(content)
        except json.JSONDecodeError:
            records = [json.loads(line) for line in content.splitlines() if line.strip()]
        if isinstance(records, dict):
            records = next((records[key] for key in ("logs", "events", "records", "data")
                            if isinstance(records.get(key), list)), [records])
    elif suffix == ".txt":
        records = [{"message": line.strip()} for line in content.splitlines() if line.strip()]
    else:
        raise ValueError("Choose a CSV, TXT, or JSON file.")
    if not isinstance(records, list) or not records or not all(isinstance(row, dict) for row in records):
        raise ValueError("The dataset must contain log records.")
    if len(records) > 20000:
        raise ValueError("The dataset exceeds 20,000 log records.")
    rows = normalize(records)
    if not rows:
        raise ValueError("No recognized log fields were found.")
    return rows


def metric(value, name, message):
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(ms|s|%)?\s*", value, re.I)
    if not match:
        match = re.search(METRICS[name], message, re.I)
    if not match:
        return None
    number, unit = match.groups()
    number = float(number)
    if name == "latency":
        if unit == "%":
            return None
        value = number * 1000 if unit and unit.lower() == "s" else number
        return value if math.isfinite(value) else None
    if unit and unit != "%":
        return None
    if not unit and 0 < number < 1:
        number *= 100
    return number if number <= 100 else None


def normalize(records):
    rows = []
    seen = set()
    for record in records:
        source = {str(key).strip().lower().replace(" ", "_"): str(value).strip()
                  for key, value in record.items() if value is not None}
        row = {field: next((source[key] for key in keys if source.get(key)), "")
               for field, keys in FIELDS.items()}
        if not any(row.values()):
            continue
        message = row["message"]
        stamp = row["timestamp"]
        if not stamp:
            match = re.search(r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?", message)
            stamp = match.group() if match else ""
        if re.fullmatch(r"\d{10}|\d{13}", stamp):
            timestamp = pd.to_datetime(int(stamp), unit="ms" if len(stamp) == 13 else "s", utc=True, errors="coerce")
        else:
            timestamp = pd.to_datetime(stamp.replace(",", "."), utc=True, errors="coerce")
        row["timestamp"] = timestamp.isoformat() if pd.notna(timestamp) else None
        level = re.search(r"\b(CRITICAL|FATAL|ERROR|ERR|WARNING|WARN|INFO|DEBUG|TRACE|HIGH|MEDIUM|LOW)\b",
                          row["level"] or message, re.I)
        level = level.group().upper() if level else "UNKNOWN"
        row["level"] = {"FATAL": "CRITICAL", "WARN": "WARNING", "ERR": "ERROR"}.get(level, level)
        service = re.search(r"\b(?:service|component)\s*[:=]\s*([\w.-]+)", message, re.I)
        row["service"] = row["service"] or (service.group(1) if service else "Unknown service")
        for name in METRICS:
            row[name] = metric(row[name], name, message)
        key = tuple(row.values())
        if key not in seen:
            seen.add(key)
            rows.append(row)
    return rows
