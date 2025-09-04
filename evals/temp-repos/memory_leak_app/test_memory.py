import psutil
import requests
import time

def test_memory_usage():
    # Basic test - check if memory monitoring exists
    import psutil
    process = psutil.Process()
    initial_memory = process.memory_info().rss
    print(f"Initial memory: {initial_memory / 1024 / 1024:.2f} MB")
    assert initial_memory > 0
