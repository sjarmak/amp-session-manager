def test_processor_exists():
    try:
        import processor
        assert hasattr(processor, 'process_csv')
    except ImportError:
        assert False, "processor module not found"
