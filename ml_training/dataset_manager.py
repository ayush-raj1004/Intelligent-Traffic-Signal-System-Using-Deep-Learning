import os
import shutil
import yaml

def setup_dataset_structure():
    """
    Creates the required directory structure for YOLO training.
    """
    base_dir = 'ml_training/datasets'
    sub_dirs = [
        'vehicles/train/images', 'vehicles/train/labels',
        'vehicles/val/images', 'vehicles/val/labels',
        'plates/train/images', 'plates/train/labels',
        'plates/val/images', 'plates/val/labels',
        'ocr/train/images', 'ocr/train/labels',
        'ocr/val/images', 'ocr/val/labels'
    ]
    
    for d in sub_dirs:
        os.makedirs(os.path.join(base_dir, d), exist_ok=True)
    
    print(f"Created dataset structure at {base_dir}")

def generate_sample_configs():
    """
    Generates yaml configuration files for YOLO trainer.
    """
    configs_dir = 'ml_training/data_configs'
    os.makedirs(configs_dir, exist_ok=True)
    
    vehicle_cfg = {
        'path': os.path.abspath('ml_training/datasets/vehicles'),
        'train': 'train/images',
        'val': 'val/images',
        'names': {
            0: 'car',
            1: 'truck',
            2: 'bus',
            3: 'motorcycle',
            4: 'ambulance'
        }
    }
    
    plate_cfg = {
        'path': os.path.abspath('ml_training/datasets/plates'),
        'train': 'train/images',
        'val': 'val/images',
        'names': {
            0: 'license_plate'
        }
    }

    ocr_cfg = {
        'path': os.path.abspath('ml_training/datasets/ocr'),
        'train': 'train/images',
        'val': 'val/images',
        'names': {i: str(c) for i, c in enumerate("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ")}
    }
    
    with open(os.path.join(configs_dir, 'vehicles.yaml'), 'w') as f:
        yaml.dump(vehicle_cfg, f)
        
    with open(os.path.join(configs_dir, 'plates.yaml'), 'w') as f:
        yaml.dump(plate_cfg, f)

    with open(os.path.join(configs_dir, 'ocr.yaml'), 'w') as f:
        yaml.dump(ocr_cfg, f)
    
    print("Generated YAML configurations for training.")

if __name__ == "__main__":
    setup_dataset_structure()
    generate_sample_configs()
