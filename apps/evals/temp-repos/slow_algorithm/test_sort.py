from slow_sort import bubble_sort

def test_sorting_correctness():
    test_data = [64, 34, 25, 12, 22, 11, 90]
    result = bubble_sort(test_data.copy())
    assert result == sorted(test_data)

def test_performance_reasonable():
    # Test with smaller dataset for reasonable test time
    import time
    from slow_sort import sort_large_dataset
    result, duration = sort_large_dataset(100)  # Smaller for testing
    assert duration < 10.0  # Should be much faster after optimization
