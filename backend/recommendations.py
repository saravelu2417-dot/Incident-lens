STEPS = {
    "database": ["Check the database endpoint, credentials, and connectivity.", "Inspect connection pool utilization and database slow-query logs."],
    "network": ["Check DNS resolution, service reachability, and upstream health.", "Review packet loss, routing, and firewall changes around the event."],
    "auth": ["Verify token expiry, issuer, and credentials.", "Review authentication configuration changes and identity provider availability."],
    "memory": ["Inspect heap growth and memory limits for the affected service.", "Use memory profiling to identify retained objects before changing limits or restarting."],
    "cpu": ["Identify CPU-intensive processes or requests.", "Check load changes and profile hot paths before adjusting capacity."],
    "latency": ["Inspect endpoint traces and slow queries.", "Compare upstream timings and request volume with normal periods."],
    "application": ["Inspect the stack trace and the most recent deployment.", "Check dependency health and reproduce the failure with the recorded inputs."],
    "unknown": ["Inspect neighboring logs and service telemetry around the event.", "Compare the observed event with the service's usual behavior."],
}
