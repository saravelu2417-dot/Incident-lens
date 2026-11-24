import os
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_file, send_from_directory

from . import database as store
from .ingestion import parse
from .reports import csv_report, pdf_report
from .root_cause import investigate

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"
SAMPLE = ROOT / "data" / "sample_logs.csv"


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(DATABASE=os.getenv("INCIDENT_DATABASE", str(ROOT / "instance" / "incidents.sqlite3")),
                      MAX_CONTENT_LENGTH=5 * 1024 * 1024)
    app.config.update(config or {})
    store.init(app)

    @app.get("/api/datasets")
    def datasets():
        return jsonify(store.datasets())

    @app.post("/api/datasets")
    def upload():
        file = request.files.get("file")
        if not file or not file.filename:
            abort(400, "Select a log file.")
        name = file.filename.replace("\\", "/").rsplit("/", 1)[-1]
        data = file.read()
        try:
            rows = parse(name, data)
        except ValueError as error:
            abort(400, str(error))
        return jsonify(id=store.save_dataset(name, data, rows)), 201

    @app.post("/api/sample")
    def sample():
        data = SAMPLE.read_bytes()
        return jsonify(id=store.save_dataset("Demo · " + SAMPLE.name, data, parse(SAMPLE.name, data), reuse=True))

    def dataset_logs(dataset):
        rows = store.logs(dataset)
        if not rows:
            abort(404, "Dataset not found.")
        return rows

    @app.get("/api/datasets/<int:dataset>/logs")
    def get_logs(dataset):
        return jsonify(dataset_logs(dataset))

    @app.post("/api/datasets/<int:dataset>/analyze")
    def analyze(dataset):
        rows = dataset_logs(dataset)
        if not store.analyzed(dataset):
            rows, incidents = investigate(rows)
            store.save_analysis(dataset, rows, incidents)
        return jsonify(store.incident_rows(dataset))

    @app.get("/api/incidents")
    def get_incidents():
        return jsonify(store.incident_rows(request.args.get("dataset", type=int)))

    @app.get("/api/incidents/<int:incident>")
    @app.get("/api/incidents/<int:incident>/causes")
    def get_incident(incident):
        rows = store.incident_rows(incident=incident)
        if not rows:
            abort(404, "Incident not found.")
        return jsonify(rows[0]["causes"] if request.path.endswith("/causes") else rows[0])

    @app.patch("/api/incidents/<int:incident>")
    def change_status(incident):
        body = request.get_json(silent=True)
        status = body.get("status") if isinstance(body, dict) else None
        if status not in ("Open", "Investigating", "Resolved"):
            abort(400, "Invalid incident status.")
        if not store.update_status(incident, status):
            abort(404, "Incident not found.")
        return jsonify(store.incident_rows(incident=incident)[0])

    @app.get("/api/reports/<kind>")
    def report(kind):
        dataset = request.args.get("dataset", type=int)
        incident = request.args.get("incident", type=int)
        incidents = store.incident_rows(dataset, incident)
        if incident and not incidents:
            abort(404, "Incident not found.")
        if kind == "pdf":
            return send_file(pdf_report(incidents), mimetype="application/pdf", as_attachment=True,
                             download_name="incident-investigation.pdf")
        if kind == "incidents":
            fields = ("id", "timestamp", "service", "category", "severity", "status", "message",
                      "classification_score", "anomaly_score", "probable_cause", "evidence", "recommendations")
            rows = [dict(row, probable_cause=row["causes"][0]["title"],
                         evidence=" | ".join(row["causes"][0]["evidence"]),
                         recommendations=" | ".join(row["recommendations"])) for row in incidents]
        elif kind == "logs" and dataset is not None:
            rows = dataset_logs(dataset)
            fields = ("id", "timestamp", "service", "level", "message", "latency", "cpu", "memory", "anomaly", "anomaly_score")
        else:
            abort(404, "Report not found.")
        return csv_report(rows, fields), 200, {"Content-Type": "text/csv; charset=utf-8",
                                              "Content-Disposition": f"attachment; filename={kind}.csv"}

    @app.get("/")
    def front():
        if not (DIST / "index.html").is_file():
            return "Build the frontend in frontend/ or open the Vite development URL.", 503
        return send_from_directory(DIST, "index.html")

    @app.get("/assets/<path:name>")
    def assets(name):
        return send_from_directory(DIST / "assets", name)

    def error_response(error):
        return jsonify(error=error.description), error.code

    for code in (400, 404, 413):
        app.register_error_handler(code, error_response)
    return app
