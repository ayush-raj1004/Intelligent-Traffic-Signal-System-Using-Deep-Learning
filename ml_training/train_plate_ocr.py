import os
from ultralytics import YOLO

def train_plate_ocr():
    """
    Trains a YOLOv8 model for Character Recognition (OCR) on license plates.
    This model expects crops of license plates correctly labeled with character boxes.
    """
    # Load a pretrained model
    # We use yolo8n (nano) as it's very fast for small object (character) detection
    model = YOLO('yolov8n.pt') 

    print("--- Starting License Plate OCR Training ---")
    
    # Train the model
    # Expects a dataset with 36 classes (0-9, A-Z)
    results = model.train(
        data='ml_training/data_configs/ocr.yaml',
        epochs=150,       # OCR often needs more epochs to achieve high accuracy on characters
        imgsz=320,        # Plate crops are usually small, so 320 or even 160 is often enough
        batch=32,
        project='ml_training/runs/ocr',
        name='plate_ocr_v1'
    )
    
    print(f"OCR training completed. Model saved at: {results.save_dir}")

if __name__ == "__main__":
    train_plate_ocr()
