-- AI-Based Intelligent Traffic Management System
-- Database Schema (PostgreSQL)

-- 1. Intersections Table
CREATE TABLE intersections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Lanes Table
CREATE TABLE lanes (
    id SERIAL PRIMARY KEY,
    intersection_id UUID REFERENCES intersections(id),
    lane_name VARCHAR(50) NOT NULL,
    direction VARCHAR(20), -- NORTH, SOUTH, EAST, WEST
    max_capacity INTEGER DEFAULT 100
);

-- 3. Traffic Logs (High Volume - Partitioning Recommended)
CREATE TABLE traffic_logs (
    id BIGSERIAL PRIMARY KEY,
    lane_id INTEGER REFERENCES lanes(id),
    vehicle_count INTEGER NOT NULL,
    average_speed DECIMAL(5, 2),
    density_percentage DECIMAL(5, 2),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Alert Events
CREATE TYPE alert_type AS ENUM ('ACCIDENT', 'VIOLATION', 'EMERGENCY_PRIORITY', 'CONGESTION');

CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    intersection_id UUID REFERENCES intersections(id),
    type alert_type NOT NULL,
    description TEXT,
    is_resolved BOOLEAN DEFAULT FALSE,
    severity INTEGER DEFAULT 1, -- 1: Low, 5: Critical
    snapshot_url TEXT, -- Path to CCTV frame
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Signal State History (Auditing AI Decisions)
CREATE TABLE signal_history (
    id BIGSERIAL PRIMARY KEY,
    intersection_id UUID REFERENCES intersections(id),
    lane_id INTEGER REFERENCES lanes(id),
    state VARCHAR(10), -- RED, GREEN, YELLOW
    duration_seconds INTEGER,
    ai_confidence DECIMAL(4, 3),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sample Query: Get average density for an intersection in the last hour
-- SELECT l.lane_name, AVG(log.density_percentage)
-- FROM traffic_logs log
-- JOIN lanes l ON log.lane_id = l.id
-- WHERE l.intersection_id = 'YOUR_UUID'
-- AND log.timestamp > NOW() - INTERVAL '1 hour'
-- GROUP BY l.lane_name;
