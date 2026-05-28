import os
from ultralytics import YOLO

def train_plate_detector():
    """
    Trains a YOLOv8 model specifically for License Plate Detection (LPD).
    """
    # Load a pretrained model for object detection
    model = YOLO('yolov8n.pt') 

    print("--- Starting Number Plate Detection Training ---")
    
    # Train for number plates specifically
    # Expects a dataset with a 'plate' class
    results = model.train(
        data='ml_training/data_configs/plates.yaml',
        epochs=100,
        imgsz=640,
        project='ml_training/runs/plates',
        name='plate_detector'
    )
    
    print(f"Number Plate training completed. Model saved at: {results.save_dir}")

if __name__ == "__main__":
    train_plate_detector()
