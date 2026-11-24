FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    INCIDENT_DATABASE=/data/incidents.sqlite3
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt "gunicorn>=23,<24"
COPY backend/ backend/
COPY data/sample_logs.csv data/sample_logs.csv
COPY --from=frontend /build/dist frontend/dist
RUN mkdir /data
EXPOSE 8080
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 4 --timeout 120 'backend.app:create_app()'"]
