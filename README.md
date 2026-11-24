# Software Incident Analysis and Root Cause Detection Using Data Science

Incident Lens is a local investigation dashboard for application logs, error events, and system metrics. It uses React, Tailwind CSS, Plotly, Flask, Pandas, NumPy, scikit-learn, and SQLite.

## Run locally

Use Python 3.11 or 3.12 and Node.js 22 LTS with npm. Open a shell in the project folder.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Push-Location frontend
npm ci
npm run build
Pop-Location
.\.venv\Scripts\python.exe -m flask --app backend.app run
```

Open [the local dashboard](http://127.0.0.1:5000). On macOS or Linux, use `.venv/bin/python` and `cd frontend` followed by `cd ..` for directory changes. For frontend development, leave Flask running and run `npm run dev` from `frontend` in another terminal. Vite prints its local URL and proxies API requests to Flask.

SQLite creates `instance/incidents.sqlite3` on first launch. To use another database, set the `INCIDENT_DATABASE` environment variable to its path before starting Flask.

## Host the website

The Dockerfile builds the React frontend and serves it alongside the Flask API on one origin. Use a single service instance with a persistent volume mounted at `/data` for SQLite. The build includes the bundled sample CSV. Local uploads and the local database stay outside the image.

```powershell
docker build -t incident-lens .
docker run --rm -p 127.0.0.1:8080:8080 --mount type=volume,source=incident-lens-data,target=/data incident-lens
```

### Deploy from this folder to Railway

Railway can build the checked-in Dockerfile remotely from your source. Local Docker and a GitHub repository are optional for this workflow. Install the [Railway CLI](https://docs.railway.com/cli), then open PowerShell in the repository root, where the Dockerfile is located.

1. Run `railway login` and complete sign-in in the browser. Confirm the account with `railway whoami`.
2. Run `railway up`. When prompted, create a project named `Incident Lens` in your intended workspace, or explicitly select your existing Incident Lens project and service. Wait for the deployment to become active. The build log should show that Railway detected the Dockerfile. [CLI deployment instructions](https://docs.railway.com/cli/up)
3. Run `railway open`. In the project canvas, create a **Volume**, attach it to the Incident Lens service, and set its mount path to `/data`. Wait for the resulting deployment to become active before creating demo records. [Volume instructions](https://docs.railway.com/volumes)
4. In the Incident Lens service, open **Settings → Networking → Public Networking → Generate Domain**. If Railway asks for a target port, match the service's `PORT` variable if set. Otherwise use `8080`. Copy the generated HTTPS URL. [Public networking instructions](https://docs.railway.com/networking/public-networking)
5. Open the URL in a private browser window. Confirm the dashboard loads, select **Analyze sample**, open an incident, and download a report. The `/api/datasets` path on the same domain should return JSON.

Incident Lens shares one dataset store across visitors. For a public demo, use the bundled sample data or synthetic logs. The local database and original local uploads are excluded from deployment.

## Demo workflow

1. Select **Analyze sample** on the Dashboard, or choose **Log Upload**, **Load sample preview**, and **Run analysis**.
2. Open **Log Analysis** and turn on **Anomalies only**. Compare outlier scores against normal records.
3. Open an incident from **Incident Detection** to inspect its probable causes, evidence, correlated timeline, and recommendations.
4. Set the resolution status to **Investigating** or **Resolved**. **Incident Management** lets you search, filter, and sort persisted records.
5. Open **Reports** to download a dataset PDF, investigation CSV, or processed log CSV. A single-incident PDF is available from the detail page.

The top-bar dataset selector switches between uploads and historical analyses. The notification bell lists active critical incidents for the selected dataset.

## Input formats

Upload UTF-8 CSV with headers, JSON arrays or JSON Lines, or one event per line in TXT. The upload accepts up to 5 MB per request and 20,000 records per dataset.

```csv
timestamp,service,level,message,latency_ms,cpu_percent,memory_percent
2026-11-10T09:00:00Z,checkout-api,INFO,Request completed,80,23,44
2026-11-10T09:03:00Z,checkout-api,ERROR,Database connection timeout,1500,54,60
```

```text
2026-11-10T09:03:00Z ERROR service=checkout-api Database connection timeout latency=1.5s cpu=54% memory=60%
```

Common aliases such as `msg`, `log_level`, `component`, and `response_time_ms` are accepted. CPU and memory accept percentages or decimal fractions strictly between zero and one. Missing metrics remain blank in the normalized records and are median-imputed for modeling. Missing timestamps stay blank and are excluded from temporal correlation. Duplicate normalized records are removed.

## How analysis works

| Stage | Implementation |
| --- | --- |
| Detection | Isolation Forest evaluates metrics, failure and warning flags, and recurring failure text. An incident can also be raised by an explicit failure or a metric threshold. Isolation Forest runs when at least eight records and some feature variation are available. |
| Classification | TF-IDF and a Random Forest trained on small built-in examples classify six incident categories. A single matching category keyword can guide the label. The interface shows the classification method and model vote when available. |
| Root cause | Log keywords and thresholds produce hypotheses. Nearby events within five minutes contribute evidence, with greater weight for the affected service and events at or before the trigger. The evidence score is heuristic, and probable causes require investigator confirmation. |
| Health score | Percentage of analyzed log records that did not trigger an incident. |
| Storage | SQLite keeps original uploads, normalized logs, analysis timestamps, incident evidence, recommendations, and resolution status. Analysis is idempotent per uploaded dataset so reruns preserve prior status updates. |

The supplied training examples support a reproducible teaching demo. Model vote and outlier scores are uncalibrated and have no production accuracy estimate. Each qualifying log event creates one incident, with recurring signatures and related events shown in its investigation.

## API

| Method | Route |
| --- | --- |
| GET, POST | `/api/datasets` (POST expects multipart `file`) |
| POST | `/api/sample` |
| GET | `/api/datasets/<id>/logs` |
| POST | `/api/datasets/<id>/analyze` |
| GET | `/api/incidents?dataset=<id>` |
| GET, PATCH | `/api/incidents/<id>` (PATCH accepts JSON `status`) |
| GET | `/api/incidents/<id>/causes` |
| GET | `/api/reports/pdf`, `/api/reports/incidents`, `/api/reports/logs` (use `?dataset=<id>` or `?incident=<id>` for an incident PDF) |
