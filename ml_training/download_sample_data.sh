#!/bin/bash

# Simple script to download small sample datasets for testing the training pipeline

mkdir -p ml_training/datasets/sample_images

echo "Downloading sample vehicle images..."
# Downloading a few public domain images related to traffic
curl -L -o ml_training/datasets/sample_images/traffic1.jpg https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=640&q=80
curl -L -o ml_training/datasets/sample_images/traffic2.jpg https://images.unsplash.com/photo-1510672981848-a1c4f1cb5ccf?auto=format&fit=crop&w=640&q=80

echo "Sample images downloaded to ml_training/datasets/sample_images/"
echo "Note: For actual training, you will need thousands of images and labels in YOLO format."
echo "Visit Roboflow at https://universe.roboflow.com/search?q=license+plate for ready-to-use YOLO datasets for LPD (Detection)."
echo "For OCR, search for 'License Plate CR' or 'LP OCR' datasets on Roboflow or Kaggle."
echo "Example OCR dataset: https://universe.roboflow.com/search?q=license+plate+character"
