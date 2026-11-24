import json
import sqlite3
from pathlib import Path

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, bytes INTEGER NOT NULL,
  records INTEGER NOT NULL, uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dataset_sources (
  dataset_id INTEGER PRIMARY KEY REFERENCES datasets(id), contents BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, dataset_id INTEGER NOT NULL UNIQUE REFERENCES datasets(id),
  analyzed_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS logs (
  dataset_id INTEGER NOT NULL REFERENCES datasets(id), id INTEGER NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (dataset_id, id)
);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY, dataset_id INTEGER NOT NULL REFERENCES datasets(id),
  status TEXT NOT NULL DEFAULT 'Open', data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS incidents_dataset ON incidents(dataset_id);
"""


def db():
    if "db" not in g:
        path = Path(current_app.config["DATABASE"])
        path.parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(path, timeout=15)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def init(app):
    with app.app_context():
        db().executescript(SCHEMA)
    app.teardown_appcontext(lambda error: g.db.close() if "db" in g else None)


def save_dataset(name, data, rows, reuse=False):
    connection = db()
    with connection:
        connection.execute("BEGIN IMMEDIATE")
        if reuse:
            existing = connection.execute(
                """SELECT datasets.id FROM datasets
                JOIN dataset_sources ON datasets.id = dataset_sources.dataset_id
                WHERE datasets.name = ? AND dataset_sources.contents = ? LIMIT 1""",
                (name, data),
            ).fetchone()
            if existing:
                return existing["id"]
        cursor = connection.execute("INSERT INTO datasets(name, bytes, records) VALUES (?, ?, ?)",
                                    (name, len(data), len(rows)))
        dataset = cursor.lastrowid
        connection.execute("INSERT INTO dataset_sources VALUES (?, ?)", (dataset, data))
        connection.executemany("INSERT INTO logs VALUES (?, ?, ?)",
                               ((dataset, index, json.dumps(row)) for index, row in enumerate(rows, 1)))
    return dataset


def datasets():
    return [dict(row) for row in db().execute(
        "SELECT datasets.*, runs.analyzed_at FROM datasets LEFT JOIN runs ON datasets.id = runs.dataset_id ORDER BY id DESC")]


def logs(dataset):
    return [dict(json.loads(row["data"]), id=row["id"]) for row in db().execute(
        "SELECT id, data FROM logs WHERE dataset_id = ? ORDER BY id", (dataset,))]


def analyzed(dataset):
    return db().execute("SELECT id FROM runs WHERE dataset_id = ?", (dataset,)).fetchone() is not None


def save_analysis(dataset, rows, incidents):
    connection = db()
    with connection:
        cursor = connection.execute("INSERT OR IGNORE INTO runs(dataset_id) VALUES (?)", (dataset,))
        if not cursor.rowcount:
            return
        connection.executemany("UPDATE logs SET data = ? WHERE dataset_id = ? AND id = ?",
                               ((json.dumps(row), dataset, row["id"]) for row in rows))
        connection.executemany("INSERT INTO incidents(dataset_id, data) VALUES (?, ?)",
                               ((dataset, json.dumps(incident)) for incident in incidents))


def incident_rows(dataset=None, incident=None):
    sql = "SELECT * FROM incidents"
    if incident is not None:
        sql += " WHERE id = ?"
        values = (incident,)
    elif dataset is not None:
        sql += " WHERE dataset_id = ?"
        values = (dataset,)
    else:
        values = ()
    return [dict(json.loads(row["data"]), id=row["id"], status=row["status"], dataset_id=row["dataset_id"])
            for row in db().execute(sql + " ORDER BY id DESC", values)]


def update_status(incident, status):
    connection = db()
    with connection:
        return connection.execute("UPDATE incidents SET status = ? WHERE id = ?", (status, incident)).rowcount
