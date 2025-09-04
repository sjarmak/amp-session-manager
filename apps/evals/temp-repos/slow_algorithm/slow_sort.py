import time
import random

def bubble_sort(arr):
    """Intentionally slow O(n^2) bubble sort"""
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr

def sort_large_dataset(size=5000):
    """Sort a large random dataset - currently very slow"""
    data = [random.randint(1, 1000) for _ in range(size)]
    start_time = time.time()
    result = bubble_sort(data.copy())
    end_time = time.time()
    return result, end_time - start_time

if __name__ == '__main__':
    result, duration = sort_large_dataset()
    print(f"Sorted {len(result)} items in {duration:.2f} seconds")
