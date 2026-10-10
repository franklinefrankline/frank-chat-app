"""
Performance Benchmark Suite for FRANK APIs
Measures latency and query efficiency for core endpoints.
"""

import time
import statistics
from fastapi.testclient import TestClient
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from main import app
from database import SessionLocal
import models
from security import create_access_token

client = TestClient(app)

def benchmark_endpoint(name, method, url, headers=None, data=None, iterations=5):
    times = []
    statuses = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        if method == "GET":
            res = client.get(url, headers=headers)
        elif method == "POST":
            res = client.post(url, headers=headers, json=data)
        elapsed = (time.perf_counter() - t0) * 1000  # ms
        times.append(elapsed)
        statuses.append(res.status_code)
    avg_t = statistics.mean(times)
    min_t = min(times)
    max_t = max(times)
    status_ok = all(s in [200, 201] for s in statuses)
    print(f"[{'PASS' if status_ok else 'FAIL'}] {name:<35} | Avg: {avg_t:6.2f}ms | Min: {min_t:6.2f}ms | Max: {max_t:6.2f}ms | Status: {statuses[0]}")
    return avg_t, status_ok

def run_benchmarks():
    print("=" * 75)
    print("RUNNING FRANK PERFORMANCE BENCHMARKS")
    print("=" * 75)

    db = SessionLocal()
    admin = db.query(models.User).filter(models.User.role == "admin").first()
    admin_token = create_access_token({"sub": admin.username, "user_id": admin.id, "role": "admin"})
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    regular_user = db.query(models.User).filter(models.User.role == "user", models.User.is_active == True).first()
    user_token = create_access_token({"sub": regular_user.username, "user_id": regular_user.id, "role": "user"})
    user_headers = {"Authorization": f"Bearer {user_token}"}
    db.close()

    # 1. Health endpoint
    benchmark_endpoint("GET /api/health", "GET", "/api/health")

    # 2. Conversations endpoint (previously slowest N+1 bottleneck)
    benchmark_endpoint("GET /api/users/conversations", "GET", "/api/users/conversations", headers=user_headers)

    # 3. Direct Messages endpoint
    benchmark_endpoint(f"GET /api/messages/direct/{admin.id}", "GET", f"/api/messages/direct/{admin.id}", headers=user_headers)

    # 4. Admin Metrics endpoint
    benchmark_endpoint("GET /api/admin/metrics", "GET", "/api/admin/metrics", headers=admin_headers)

    # 5. Admin Groups endpoint
    benchmark_endpoint("GET /api/admin/groups", "GET", "/api/admin/groups", headers=admin_headers)

    # 6. Admin Audit Logs endpoint
    benchmark_endpoint("GET /api/admin/audit-logs", "GET", "/api/admin/audit-logs", headers=admin_headers)

    print("=" * 75)
    print("BENCHMARK COMPLETED SUCCESSFULLY!")
    print("=" * 75)

if __name__ == "__main__":
    run_benchmarks()
