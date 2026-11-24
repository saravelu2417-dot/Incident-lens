from functools import lru_cache
import re

from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import make_pipeline

EXAMPLES = {
    "Application Error": ("application crash uncaught exception", "worker process panic stack trace", "application internal server error", "unexpected application failure", "null pointer exception"),
    "Database Failure": ("database connection timeout", "postgres database connection pool exhausted", "database sql deadlock transaction failed", "query database unavailable", "mysql too many connections"),
    "Network Issue": ("network connection reset peer", "dns lookup failed", "network packet loss upstream unreachable", "tcp socket connection refused", "network gateway timeout"),
    "Performance Degradation": ("cpu overload high utilization", "api response delay latency elevated", "request duration slow throughput", "processor saturation high cpu", "response time exceeded threshold"),
    "Authentication Failure": ("authentication failed invalid credentials", "unauthorized token expired", "login denied password incorrect", "jwt authentication failure", "certificate identity verification denied"),
    "Memory Issue": ("memory exhaustion out of memory", "oom killed heap allocation failed", "memory pressure heap full", "memory usage high possible leak", "garbage collection heap limit"),
}
SIGNALS = {
    "Database Failure": r"\b(database|postgres\w*|mysql|sql|deadlock|connection pool)\b",
    "Network Issue": r"\b(network|dns|tcp|packet loss|connection reset|upstream unreachable|connection refused)\b",
    "Authentication Failure": r"\b(auth\w*|login|unauthorized|credentials|jwt|token|forbidden)\b",
    "Memory Issue": r"\b(memory|oom|heap|allocation|garbage collection)\b",
    "Performance Degradation": r"\b(cpu|latency|response time|slow|throughput|processor)\b",
    "Application Error": r"\b(crash\w*|exception|panic|stack trace|internal server error)\b",
}


@lru_cache(maxsize=1)
def model():
    pairs = [(line, label) for label, lines in EXAMPLES.items() for line in lines]
    messages, labels = zip(*pairs)
    return make_pipeline(TfidfVectorizer(ngram_range=(1, 2)),
                         RandomForestClassifier(n_estimators=120, random_state=42)).fit(messages, labels)


def classify(rows):
    if not rows:
        return []
    estimator = model()
    descriptions = []
    for row in rows:
        description = row["message"]
        if (row["memory"] or 0) >= 90:
            description += " high memory usage heap pressure"
        if (row["cpu"] or 0) >= 90:
            description += " high cpu saturation"
        if (row["latency"] or 0) >= 1000:
            description += " high response time latency"
        descriptions.append(description)
    scores = estimator.predict_proba(descriptions)
    vectors = estimator[0].transform(descriptions)
    results = []
    for index, probabilities in enumerate(scores):
        labels = dict(zip(estimator.classes_, map(float, probabilities)))
        matches = [label for label, pattern in SIGNALS.items()
                   if re.search(pattern, rows[index]["message"], re.I)]
        if len(matches) == 1:
            label, method = matches[0], "Log keyword"
        elif vectors[index].nnz:
            label, method = max(labels, key=labels.get), "Random Forest"
        else:
            label, method = "Application Error", "Fallback"
        results.append((label, round(labels[label], 3) if vectors[index].nnz else None, method))
    return results
