from flask import Flask
import gc

app = Flask(__name__)

# Memory leak: growing list that never gets cleaned
leaked_data = []

@app.route('/')
def home():
    # This creates a memory leak
    leaked_data.extend([i for i in range(1000)])
    return f"Hello! Current leak size: {len(leaked_data)}"

@app.route('/status')  
def status():
    return {"leak_size": len(leaked_data)}
    
if __name__ == '__main__':
    app.run(debug=True)
