import os
from ultralytics import YOLO

def train_vehicle_model():
    """
    Trains a YOLOv8 model for vehicle detection and classification.
    Uses the configuration defined in data_configs/vehicles.yaml
    """
    # Load a pretrained model (e.g., YOLOv8n - nano version for speed)
    model = YOLO('yolov8n.pt') 

    print("--- Starting Vehicle Detection Training ---")
    
    # Train the model
    results = model.train(
        data='ml_training/data_configs/vehicles.yaml',
        epochs=50,
        imgsz=640,
        batch=16,
        name='vehicle_model_v1'
    )
    
    print(f"Training completed. Results saved to: {results.save_dir}")

if __name__ == "__main__":
    # Ensure directory exists
    os.makedirs('ml_training/runs', exist_ok=True)
    train_vehicle_model()
