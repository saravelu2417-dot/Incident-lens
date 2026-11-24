from collections import Counter
import re

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

ERROR_LEVELS = {"ERROR", "CRITICAL", "HIGH"}
FAILURE = re.compile(r"\b(fail(?:ed|ure)?|exception|crash(?:ed)?|timeout|timed out|denied|exhaust(?:ed|ion)|unreachable|unauthorized|oom)\b", re.I)


def signature(row):
    message = re.sub(r"\b[0-9a-f]{8}(?:-[0-9a-f]{4,12}){1,4}\b|\d+(?:\.\d+)?", "#", row["message"].lower())
    return row["service"], message


def extract(rows):
    counts = Counter(signature(row) for row in rows)
    frame = pd.DataFrame(rows, columns=("latency", "cpu", "memory")).astype(float)
    frame = frame.fillna(frame.median()).fillna(0)
    frame["failure"] = [row["level"] in ERROR_LEVELS or bool(FAILURE.search(row["message"])) for row in rows]
    frame["warning"] = [row["level"] in {"WARNING", "MEDIUM"} for row in rows]
    frame["frequency"] = np.log1p([counts[signature(row)] if failure else 0
                                  for row, failure in zip(rows, frame["failure"])])
    return frame, counts


def detect(rows):
    frame, counts = extract(rows)
    values = frame.to_numpy(dtype=float)
    if len(rows) >= 8 and np.any(np.ptp(values, axis=0)):
        forest = IsolationForest(n_estimators=100, contamination="auto", random_state=42).fit(values)
        scores = -forest.score_samples(values)
    else:
        scores = [None] * len(rows)
    for index, (row, score) in enumerate(zip(rows, scores)):
        row["id"] = index + 1
        row["anomaly_score"] = round(float(score), 4) if score is not None else None
        row["anomaly"] = bool(score is not None and score > 0.5)
        row["failure"] = bool(frame["failure"].iloc[index])
        row["recurrences"] = counts[signature(row)] if row["failure"] else 0
    return rows
