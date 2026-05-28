import time

class AdvancedTrafficMonitor:
    def __init__(self):
        self.last_emergency_trigger = 0

    def detect_emergency_vehicle(self, detections):
        """
        Specialized logic for priority vehicles.
        In production, use a high-confidence YOLO class or OCR for 'AMBULANCE'.
        """
        for det in detections:
            if det['class_name'] in ['ambulance', 'fire_truck']:
                # Return True and the lane index they are in
                return True, det.get('lane_index', 0)
        return False, None

    def detect_accidents(self, tracked_objects):
        """
        Detects anomalies such as long-term stationary objects in traffic flow.
        """
        accidents = []
        for obj in tracked_objects:
            # If speed is 0 for > 15 seconds in a main lane
            if obj.get('speed', 0) == 0 and obj.get('stationary_time', 0) > 15:
                accidents.append({
                    "id": obj['object_id'],
                    "type": "Probable Accident / Breakdown",
                    "location": obj['bbox']
                })
        return accidents

    def detect_violation(self, vehicle, signal_status):
        """
        Checks if a vehicle crossed the intersection line during Red.
        Includes capture of license plate if available.
        """
        if signal_status == "RED":
            # Check if vehicle's bottom Y coordinate crossed the 'Stop Line'
            stop_line_y = 450 # Example threshold
            if vehicle['bbox'][3] > stop_line_y:
                plate_str = vehicle.get('plate_text', 'NOT_CAPTURED')
                return {
                    "id": vehicle['object_id'],
                    "violation": "Red Light Jumping",
                    "plate": plate_str,
                    "timestamp": time.time(),
                    "status": "E-Challan Generated"
                }
        return None

# Integration logic
def run_safety_checks(detections, tracked_objects, current_signal):
    monitor = AdvancedTrafficMonitor()
    
    # 1. Emergency Check
    has_emergency, lane = monitor.detect_emergency_vehicle(detections)
    
    # 2. Safety Check
    incidents = monitor.detect_accidents(tracked_objects)
    # Add plate info to accidents if available
    for incident in incidents:
        # Find the object in tracked_objects to get its plate
        match = next((obj for obj in tracked_objects if obj['object_id'] == incident['id']), None)
        if match:
            incident['plate'] = match.get('plate_text', 'UNKNOWN')
    
    # 3. Enforcement Check
    violations = []
    for v in tracked_objects:
        vio = monitor.detect_violation(v, current_signal)
        if vio: 
            violations.append(vio)
            # Log the violation with Plate ID
            print(f"[REVENUE_LOG] VIOLATION: {vio['violation']} | Vehicle ID: {vio['id']} | Plate: {vio['plate']} | Time: {vio['timestamp']}")
        
    return {
        "priority_override": has_emergency,
        "priority_lane": lane,
        "accidents": incidents,
        "violations": violations
    }
