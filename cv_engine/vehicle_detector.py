import cv2
import numpy as np
import re
from ultralytics import YOLO

class PlateDetector:
    def __init__(self, model_path='yolov8n.pt'): # In production, replace with your trained 'plate_detector.pt'
        self.model = YOLO(model_path)
    
    def detect_plates(self, frame):
        """
        Detects license plates and returns cropped license plate images and their locations.
        """
        # In a real scenario, class_id 0 of a custom plate model would be 'plate'
        results = self.model(frame, verbose=False)[0]
        plates = []
        for r in results.boxes.data.tolist():
            x1, y1, x2, y2, score, class_id = r
            if score > 0.4:
                plate_crop = frame[int(y1):int(y2), int(x1):int(x2)]
                plates.append({
                    "bbox": [int(x1), int(y1), int(x2), int(y2)],
                    "confidence": float(score),
                    "crop": plate_crop
                })
        return plates

class PlateReader:
    def __init__(self, model_path='yolov8n.pt'): # Replace with your trained 'plate_ocr_v1.pt'
        self.model = YOLO(model_path)
        self.chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    def read_plate(self, plate_crop):
        """
        Performs character recognition on a cropped plate image.
        Validates output against Indian license plate format.
        """
        if plate_crop is None or plate_crop.size == 0:
            return "UNKNOWN"
            
        # Standard YOLO-based character detection
        results = self.model(plate_crop, imgsz=320, verbose=False)[0]
        detected_chars = []
        
        # Sort characters by their x-coordinate to get the correct order
        for r in results.boxes.data.tolist():
            x1, y1, x2, y2, score, class_id = r
            if score > 0.3:
                detected_chars.append({
                    "x": x1,
                    "char": self.chars[int(class_id)] if int(class_id) < len(self.chars) else "?"
                })
        
        detected_chars.sort(key=lambda x: x['x'])
        plate_str = "".join([c['char'] for c in detected_chars]).upper()
        
        if not plate_str:
            return "NOT_READABLE"

        # Indian License Plate Validation (HSRP Format)
        # Format: [State Code: 2L][District: 2D][Series: 1-2L][Unique: 4D]
        # Example: MH12AB1234, DL3CAY9382, KA01M1234
        indian_HS_pattern = r'^([A-Z]{2})([0-9]{2})([A-Z]{1,2})([0-9]{4})$'
        
        match = re.match(indian_HS_pattern, plate_str)
        if match:
            state, district, series, unique = match.groups()
            return f"{state} {district} {series} {unique}"
        
        # Fallback for older or different formats (e.g. MH121234)
        simple_pattern = r'^([A-Z]{2})([0-9]{1,2})([0-9]{4})$'
        match_simple = re.match(simple_pattern, plate_str)
        if match_simple:
            state, rto, unique = match_simple.groups()
            return f"{state} {rto} {unique}"

        return f"INVALID:{plate_str}"

class TrafficDetector:
    def __init__(self, model_path='yolov8n.pt'):
        # Load pre-trained YOLOv8 model
        self.model = YOLO(model_path)
        # Targeted classes for Indian traffic
        self.target_classes = {
            0: 'person', 
            1: 'bicycle', 
            2: 'car', 
            3: 'motorcycle', 
            5: 'bus', 
            7: 'truck',
            # Note: Custom models can detect 'auto-rickshaw' specifically.
            # In standard COCO, auto-rickshaws are often detected as 'car' or 'truck'.
        }

    def detect_vehicles(self, frame):
        """
        Detects vehicles in a frame and returns bounding boxes, confidences, and class IDs.
        """
        results = self.model(frame, verbose=False)[0]
        detections = []
        
        for r in results.boxes.data.tolist():
            x1, y1, x2, y2, score, class_id = r
            if int(class_id) in self.target_classes and score > 0.3:
                detections.append({
                    "bbox": [int(x1), int(y1), int(x2), int(y2)],
                    "confidence": float(score),
                    "class_name": self.target_classes[int(class_id)],
                    "class_id": int(class_id)
                })
        
        return detections

    def get_density(self, detections, frame_shape, zones):
        """
        Calculates density per zone.
        Zones are defined as polygons: [[(x1,y1), (x2,y2)...], ...]
        """
        density_stats = {f"zone_{i}": 0 for i in range(len(zones))}
        
        for det in detections:
            # Use bottom-center point of bounding box for zone check
            x_c = (det["bbox"][0] + det["bbox"][2]) // 2
            y_c = det["bbox"][3]
            
            for i, zone in enumerate(zones):
                poly = np.array(zone, np.int32)
                if cv2.pointPolygonTest(poly, (x_c, y_c), False) >= 0:
                    density_stats[f"zone_{i}"] += 1
                    break
        
        return density_stats
