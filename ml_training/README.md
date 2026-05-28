# Machine Learning Training Module

This directory contains the scripts and configurations required to train models for the Intelligent Traffic Management System.

## Contents

- `train_vehicle.py`: Training script for vehicle detection and classification (Car, Truck, Bus, etc.).
- `train_plate.py`: Training script for Number Plate Detection (LPD).
- `train_plate_ocr.py`: Training script for Character Recognition (OCR) on license plates.
- `dataset_manager.py`: Utility to setup the dataset structure and generate YAML configs.

## How to use

### 1. Initialize Structure
Run the dataset manager to create the folders:
```bash
python3 ml_training/dataset_manager.py
```

### 2. Prepare Data
- Place your training images in `ml_training/datasets/<target>/train/images/`
- Place your YOLO-format labels in `ml_training/datasets/<target>/train/labels/`
- Repeat for the `val` (validation) folders.

### 3. Start Training
To train the vehicle model:
```bash
python3 ml_training/train_vehicle.py
```

To train the plate detector:
```bash
python3 ml_training/train_plate.py
```

To train the character recognition (OCR) model:
```bash
python3 ml_training/train_plate_ocr.py
```

## Dataset Sources
We recommend using the following open-source datasets:
- **COCO Dataset**: Great for general vehicle detection.
- **OpenImages**: Good for specific vehicle types like ambulances.
- **Roboflow Universe**: Excellent source for "License Plate Detection" datasets in YOLO format.

## Accident Detection
Accident detection in this system is currently logic-based (detecting stationary anomalies). To train a dedicated accident model, you would follow a similar pattern as `train_vehicle.py` but with a dataset of labeled accident scenes.
