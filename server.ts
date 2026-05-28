import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- TRAFFIC STATE ---
  interface Vehicle {
    type: string;
    weight: number;
    color: string;
    priority: boolean;
    plate?: string;
  }

  const generatePlate = () => {
    const states = ["MH", "DL", "KA", "TN", "UP", "WB", "GJ", "TS", "RJ", "HR", "AP", "MP"];
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    
    const state = states[Math.floor(Math.random() * states.length)];
    const rto = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    const series = Array.from({ length: 2 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    const unique = Array.from({ length: 4 }, () => numbers[Math.floor(Math.random() * numbers.length)]).join('');
    
    return `${state} ${rto} ${series} ${unique}`;
  };

  const VEHICLE_CLASSES = [
    { type: 'Ambulance', weight: 5, color: '#ef4444', priority: true },
    { type: 'Truck', weight: 3, color: '#ec4899', priority: false },
    { type: 'Car', weight: 2, color: '#eab308', priority: false },
    { type: 'Auto', weight: 2, color: '#22c55e', priority: false },
    { type: 'Bike', weight: 1, color: '#3b82f6', priority: false },
  ];

  interface Lane {
    name: string;
    vehicles: Vehicle[];
    signal: "GREEN" | "YELLOW" | "RED";
    timer: number;
    densityScore: number;
    waitTime: number;
    accident: boolean;
    accidentSeverity?: 'LOW' | 'MEDIUM' | 'HIGH';
    downstreamBlocked: boolean;
    mode: 'NORMAL' | 'EMERGENCY' | 'ACCIDENT' | 'HYBRID';
    redBacklog: number;
    clearedCount: number;
    ambulancePassed?: boolean;
    savedSignalBeforeHybrid?: "GREEN" | "YELLOW" | "RED";
  }

  interface Intersection {
    id: string;
    name: string;
    lanes: Lane[];
    emergency: boolean;
    alerts: any[];
    detectedPlates: string[];
  }

  let currentPair = "NS"; 
  let phaseTimer = 15;
  let isYellowPhase = false;
  let isAllRedPhase = false;
  
  // --- EMERGENCY OVERRIDE STATE ---
  type EmergencyState = 'NONE' | 'INTERRUPTING_YELLOW' | 'INTERRUPTING_RED' | 'SERVING' | 'POST_EMERGENCY_YELLOW' | 'POST_EMERGENCY_RED';
  let emergencySequence: EmergencyState = 'NONE';
  let savedState: { pair: string, timer: number } | null = null;
  let emergencyLaneIdx: number | null = null;

  const poissonSample = (lambda: number) => {
    let L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= Math.random();
    } while (p > L);
    return k - 1;
  };

  const generateInitialVehicles = () => {
    const lambda = 20;
    const base = poissonSample(lambda);
    const jitter = Math.floor(Math.random() * 6) - 3;
    const count = Math.min(35, Math.max(12, base + jitter));
    
    return Array.from({ length: count }, () => {
      const cls = VEHICLE_CLASSES[Math.floor(Math.random() * VEHICLE_CLASSES.length)];
      let finalCls = { ...cls, plate: generatePlate() };
      if (cls.type === 'Ambulance' && Math.random() > 0.05) {
          finalCls = { ...VEHICLE_CLASSES[Math.floor(Math.random() * 3) + 2], plate: generatePlate() };
      }
      return finalCls;
    });
  };

  let trafficState: { intersections: Intersection[] } = {
    intersections: [
      {
        id: "INT-001",
        name: "Central Square",
        lanes: [
          { name: "North", vehicles: generateInitialVehicles(), signal: "GREEN", timer: 15, densityScore: 0, waitTime: 0, accident: false, downstreamBlocked: false, mode: 'NORMAL', redBacklog: 0, clearedCount: 0 },
          { name: "South", vehicles: generateInitialVehicles(), signal: "GREEN", timer: 15, densityScore: 0, waitTime: 0, accident: false, downstreamBlocked: false, mode: 'NORMAL', redBacklog: 0, clearedCount: 0 },
          { name: "East", vehicles: generateInitialVehicles(), signal: "RED", timer: 15, densityScore: 0, waitTime: 0, accident: false, downstreamBlocked: false, mode: 'NORMAL', redBacklog: 0, clearedCount: 0 },
          { name: "West", vehicles: generateInitialVehicles(), signal: "RED", timer: 15, densityScore: 0, waitTime: 0, accident: false, downstreamBlocked: false, mode: 'NORMAL', redBacklog: 0, clearedCount: 0 },
        ],
        emergency: false,
        alerts: [] as any[],
        detectedPlates: [] as string[]
      }
    ]
  };

  // --- API ROUTES FIRST ---
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/traffic', (req, res) => {
    try {
      console.log(`[SERVER_LOG] Serving traffic state to ${req.ip}`);
      res.json(trafficState);
    } catch (error) {
      console.error('Error serving /api/traffic:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/manual/accident', (req, res) => {
    try {
      const { laneName } = req.body;
      const inter = trafficState.intersections[0];
      const lane = inter.lanes.find(l => l.name === laneName);
      if (lane) {
        lane.accident = true;
        lane.accidentSeverity = 'HIGH'; // Manual bypass = High priority
        
        // Protocol: If manual report, force system to rethink phase immediately
        phaseTimer = Math.min(phaseTimer, 3); 
        
        inter.alerts.unshift({
          type: "EMERGENCY",
          msg: `MANUAL_REPORT: High-severity accident confirmed at ${laneName}. Protocol: HYBRID_INIT.`,
          time: new Date().toISOString()
        });
        res.json({ status: 'ok' });
      } else {
        res.status(404).json({ error: 'Lane not found' });
      }
    } catch (error) {
       console.error('Error in /api/manual/accident:', error);
       res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/manual/clear-accident', (req, res) => {
    const { laneName } = req.body;
    const inter = trafficState.intersections[0];
    const lane = inter.lanes.find(l => l.name === laneName);
    if (lane) {
      lane.accident = false;
      inter.alerts.unshift({
        type: "SYSTEM",
        msg: `EVENT_CLEARED: Accident at ${laneName} has been cleared. Resuming normal flow.`,
        time: new Date().toISOString()
      });
      res.json({ status: 'ok' });
    } else {
      res.status(404).json({ error: 'Lane not found' });
    }
  });

  const triggerEmergency = (laneName: string) => {
    const inter = trafficState.intersections[0];
    const lane = inter.lanes.find(l => l.name === laneName);
    if (!lane) return false;

    // Manual Emergency Pulse: Add prioritized asset
    lane.vehicles.unshift({ ...VEHICLE_CLASSES[0], plate: generatePlate() }); 
    
    // Briefly reduce phaseTimer to 5s if it's currently longer
    // This allows for a smooth clearance window before preemption starts
    if (emergencySequence === 'NONE') {
      phaseTimer = Math.min(phaseTimer, 5); 
    }
    
    inter.alerts.unshift({
      type: "MANUAL",
      msg: `EMERGENCY_PULSE: Priority asset deployed to ${laneName}. Response window: 5s.`,
      time: new Date().toISOString()
    });
    return true;
  };

  app.post('/api/manual/emergency', (req, res) => {
    const { laneName } = req.body;
    if (triggerEmergency(laneName)) {
      res.json({ status: 'ok' });
    } else {
      res.status(404).json({ error: 'Lane not found' });
    }
  });

  app.post('/api/manual/density', (req, res) => {
    const { laneName, count } = req.body;
    const inter = trafficState.intersections[0];
    const lane = inter.lanes.find(l => l.name === laneName);
    if (lane) {
      const currentCount = lane.vehicles.length;
      if (count > currentCount) {
        for(let i=0; i < (count - currentCount); i++) {
           lane.vehicles.push({ ...VEHICLE_CLASSES[Math.floor(Math.random() * 3) + 2], plate: generatePlate() });
        }
      } else if (count < currentCount) {
        lane.vehicles.splice(0, currentCount - count);
      }
      res.json({ status: 'ok', density: lane.vehicles.length });
    } else {
      res.status(404).json({ error: 'Lane not found' });
    }
  });

  app.post('/api/manual/phase', (req, res) => {
    const { pair } = req.body;
    if (pair === "NS" || pair === "EW") {
      if (emergencySequence === 'NONE') {
        phaseTimer = 0;
      }
      res.json({ status: 'ok', msg: 'Transition triggered' });
    } else {
      res.status(400).json({ error: 'Invalid pair' });
    }
  });

  app.post('/api/manual/pulse', (req, res) => {
    const inter = trafficState.intersections[0];
    inter.emergency = true;
    phaseTimer = 0; // Force immediate transition
    isYellowPhase = false;
    isAllRedPhase = false;
    inter.alerts.unshift({
      type: "SYSTEM",
      msg: "HYPER_PULSE: manual system override. Recalculating optimal flow instantly.",
      time: new Date().toISOString()
    });
    res.json({ status: 'ok' });
  });

  const calculateDensityScore = (vehicles: any[]) => {
    return vehicles.reduce((acc, v) => acc + v.weight, 0);
  };

  // Main Simulation Loop (1Hz)
  setInterval(() => {
    try {
      const now = Date.now();
      
      trafficState.intersections.forEach(inter => {
        // 1. Update Lane Dynamics
        inter.lanes.forEach((lane, idx) => {
          const now = Date.now();
          const temporalFactor = (Math.sin(now / 15000) + 1.2) / 2.2; 
          const spatialBias = [1.3, 0.7, 1.1, 0.9][idx];
          const baseArrivalLambda = 0.8;
          const arrivalLambda = baseArrivalLambda * temporalFactor * spatialBias;

          // --- DYNAMIC CONGESTION: SPILLBACK SIMULATION ---
          if (lane.signal === "GREEN" && Math.random() < 0.02) {
             lane.downstreamBlocked = !lane.downstreamBlocked;
             if (lane.downstreamBlocked) {
                inter.alerts.unshift({
                  type: "SYSTEM",
                  msg: `CONGESTION_WARNING: Downstream spillback detected at ${lane.name}. Flow restricted.`,
                  time: new Date().toISOString()
                });
             }
          } else if (lane.signal === "RED") {
             lane.downstreamBlocked = false; // Reset on RED as queue builds
          }

          // --- HYBRID MODE DETECTION ---
          const hasAmbulance = lane.vehicles.some(v => v.type === 'Ambulance');
          if (lane.accident && hasAmbulance && lane.mode !== 'HYBRID') {
             lane.mode = 'HYBRID';
             lane.savedSignalBeforeHybrid = lane.signal;
             lane.signal = 'YELLOW'; // Slow movement mode
             inter.alerts.unshift({
               type: "EMERGENCY",
               msg: `HYBRID_MODE: Ambulance in accident lane ${lane.name}. Initiating controlled slow-clearance.`,
               time: new Date().toISOString()
             });
          }

          // --- DISCHARGE LOGIC ---
          if (lane.mode === 'HYBRID') {
             // Controlled slow movement for hybrid mode
             const dischargeRate = 1.0; 
             const exitCount = Math.min(poissonSample(dischargeRate), lane.vehicles.length);
             
             // Check if ambulance exits (Virtual stop line detection simulation)
             const ambulanceIdx = lane.vehicles.findIndex(v => v.type === 'Ambulance');
             if (ambulanceIdx !== -1 && ambulanceIdx < exitCount) {
                lane.ambulancePassed = true;
             }

             lane.vehicles.splice(0, exitCount);
             lane.clearedCount += exitCount;

             if (lane.ambulancePassed) {
                // Exit Hybrid Mode
                lane.mode = lane.accident ? 'ACCIDENT' : 'NORMAL';
                lane.signal = 'RED'; // Safety transition
                lane.ambulancePassed = false;
                inter.alerts.unshift({
                  type: "SYSTEM",
                  msg: `HYBRID_EXIT: Ambulance passed ${lane.name}. Restoring safe-state (RED).`,
                  time: new Date().toISOString()
                });
             }
          } else if (lane.signal === "GREEN" && !lane.accident && !lane.downstreamBlocked) {
            // Standard Discharge (Y++ Tracked)
            const dischargeBaseLambda = 1.5; 
            const exitCount = Math.min(poissonSample(dischargeBaseLambda), lane.vehicles.length);
            lane.vehicles.splice(0, exitCount);
            lane.clearedCount += exitCount; // Update Y
            lane.waitTime = 0;
            lane.mode = 'NORMAL';
          } else if (lane.signal === "GREEN" && (lane.accident || lane.downstreamBlocked)) {
             // Protocol: Force RED if accident or critical block detected in active green
             if (lane.accident || lane.downstreamBlocked) {
                lane.signal = "RED"; 
                lane.timer = 0;
                lane.mode = lane.accident ? 'ACCIDENT' : 'NORMAL';
                inter.alerts.unshift({
                   type: "EMERGENCY",
                   msg: `SAFETY_PROTOCOL: Interrupting GREEN at ${lane.name} (Blockage/Accident).`,
                   time: new Date().toISOString()
                });
             }
          } else {
            lane.waitTime++;
            if (lane.signal === "RED") {
               // Capture X (initial queue) when in RED
               // If it's a new RED cycle, we keep the backlog established at the start of RED
               if (lane.clearedCount > 0) {
                  lane.redBacklog = lane.vehicles.length;
                  lane.clearedCount = 0; // Reset Y
               } else {
                  lane.redBacklog = Math.max(lane.redBacklog, lane.vehicles.length);
               }
            }
            lane.mode = lane.accident ? 'ACCIDENT' : 'NORMAL';
          }
          
          // --- ACCIDENT HANDLING ---
          if (lane.accident) {
             if (Math.random() < 0.01) {
               lane.accident = false;
               lane.accidentSeverity = undefined;
               inter.alerts.unshift({
                 type: "SYSTEM",
                 msg: `PROTOCOL_RESUME: ${lane.name} accident cleared. Rejoining dynamic flow.`,
                 time: new Date().toISOString()
               });
             }
          }

          // Poisson Arrivals
          const newArrivalsCount = poissonSample(arrivalLambda);
          for (let i = 0; i < newArrivalsCount; i++) {
            const cls = VEHICLE_CLASSES[Math.floor(Math.random() * VEHICLE_CLASSES.length)];
            if (cls.type !== 'Ambulance' || Math.random() < 0.02) {
               const newVeh = { ...cls, plate: generatePlate() };
               lane.vehicles.push(newVeh);
            }
          }

          // Range Management
          if (lane.vehicles.length < 12) {
            const refillCount = Math.min(12 - lane.vehicles.length, 2);
            for (let i = 0; i < refillCount; i++) {
              lane.vehicles.push({ ...VEHICLE_CLASSES[Math.floor(Math.random() * 3) + 2], plate: generatePlate() });
            }
          }
          if (lane.vehicles.length > 35) lane.vehicles.splice(35);
          
          // --- SEVERITY-BASED ACCIDENT DETECTION ---
          if (!lane.accident && Math.random() < 0.001) {
             lane.accident = true;
             const severities: ('LOW' | 'MEDIUM' | 'HIGH')[] = ['LOW', 'MEDIUM', 'HIGH'];
             lane.accidentSeverity = severities[Math.floor(Math.random() * severities.length)];
             
             // If GREEN, force RED immediately for protocol safety
             if (lane.signal === 'GREEN') {
                lane.signal = 'RED';
                inter.alerts.unshift({
                  type: "EMERGENCY",
                  msg: `SAFETY_INTERRUPT: Accident in active signal [${lane.name}]. Forcing RED.`,
                  time: new Date().toISOString()
                });
             }

             inter.alerts.unshift({
                type: "EMERGENCY",
                msg: `AI_VISION: Accident detected [${lane.name}] - Severity: ${lane.accidentSeverity}`,
                time: new Date().toISOString()
             });
          }

          lane.densityScore = calculateDensityScore(lane.vehicles);
        });

        // --- SYSTEMATIC ANPR SCANNING ---
        // Every cycle, the AI scanning system attempts to read plates of passing vehicles
        inter.lanes.forEach(l => {
          if (l.vehicles.length > 0 && Math.random() < 0.2) {
            const randomIdx = Math.floor(Math.random() * l.vehicles.length);
            const randomVeh = l.vehicles[randomIdx];
            if (randomVeh.plate) {
              // Ensure we don't spam the same plate repeatedly in the logs
              if (!inter.detectedPlates.includes(randomVeh.plate)) {
                 inter.detectedPlates.unshift(randomVeh.plate);
                 if (inter.detectedPlates.length > 50) inter.detectedPlates.pop();
              }
            }
          }
        });

        // 2. Signal Logic Execution
        const emergencyInRedIdx = inter.lanes.findIndex(l => l.signal !== "GREEN" && l.vehicles.some(v => v.priority));
        
        // Preemption Trigger: Delayed until current window (pulse duration) expires
        if (emergencySequence === 'NONE' && emergencyInRedIdx !== -1 && phaseTimer <= 0) {
          emergencySequence = 'INTERRUPTING_YELLOW';
          emergencyLaneIdx = emergencyInRedIdx;
          savedState = {
            pair: currentPair,
            timer: phaseTimer
          };
          
          // Interrupt current Green immediately
          isYellowPhase = true;
          phaseTimer = 4;
          inter.lanes.forEach(l => {
            if (l.signal === "GREEN") l.signal = "YELLOW";
          });

          inter.alerts.unshift({
            type: "EMERGENCY",
            msg: `EMERGENCY_PREEMPT: Storing ${currentPair} state (${savedState.timer}s left). Interrupting...`,
            time: new Date().toISOString()
          });
        }

        if (emergencySequence === 'NONE') {
          // --- NORMAL ADAPTIVE LOGIC ---
          phaseTimer--;
          inter.lanes.forEach(l => l.timer = Math.max(0, phaseTimer));

          const minGreenTime = 15;
          const maxGreenTime = 60;

          // Dynamic Green Calculation Helper
          const calculateOptimalGreen = (laneIndices: number[]) => {
            const lanes = laneIndices.map(i => inter.lanes[i]);
            const density = lanes.reduce((sum, l) => sum + l.densityScore, 0);
            const hasPriority = lanes.some(l => l.vehicles.some(v => v.priority));
            
            // Adaptive Rerouting Bonus: If other perpendicular lanes are blocked, 
            // give more time to current lanes to maximize throughput.
            const otherIndices = laneIndices.includes(0) ? [2, 3] : [0, 1];
            const otherBlockedCount = otherIndices.filter(i => inter.lanes[i].accident).length;
            const rerouteBonus = otherBlockedCount * 10;

            const priorityBonus = hasPriority ? 20 : 0;
            return Math.min(maxGreenTime, Math.max(minGreenTime, Math.floor(density * 0.8) + priorityBonus + rerouteBonus));
          };

          // --- OPTIMIZATION LOGIC (RED vs GREEN PASSING) ---
          // STEP 1: X[lane] = Count of vehicles waiting (Captured during RED)
          // STEP 2: Y[lane] = Count of vehicles crossed (Captured during GREEN)
          // STEP 3: DECISION -> IF (Y >= X + buffer) AND (time >= MIN) -> Switch early
          const activeLanes = inter.lanes.filter(l => l.signal === "GREEN" && !l.accident);
          
          if (!isYellowPhase && !isAllRedPhase && activeLanes.length > 0) {
             // Implementation Step: Decision (Y >= X + buffer)
             // Buffer represents extra flow allowed during the green window
             const buffer = 5; 
             
             // Check if vehicles cleared (Y) >= initial queue (X) + buffer
             const demandServiced = activeLanes.some(l => l.clearedCount > (l.redBacklog + buffer));
             
             const initialTime = activeLanes[0].name === "North" || activeLanes[0].name === "South" ? 
                                 calculateOptimalGreen([0, 1]) : calculateOptimalGreen([2, 3]);
             const elapsed = initialTime - phaseTimer;

             // Protocol Decision: Switch IF throughput achieved AND min time elapsed
             if (demandServiced && elapsed >= minGreenTime) {
                // If we also track Y across all active lanes
                const totalCleared = activeLanes.reduce((s, l) => s + l.clearedCount, 0);
                const totalBacklog = activeLanes.reduce((s, l) => s + l.redBacklog, 0);

                if (totalCleared >= (totalBacklog + buffer * activeLanes.length) || phaseTimer <= 5) {
                   phaseTimer = 0; // Trigger Switch
                   inter.alerts.unshift({
                     type: "OPTIMIZATION",
                     msg: `TRAFFIC_DECISION: Phase clear (Throughput Y:${totalCleared} achieved). Triggering switch.`,
                     time: new Date().toISOString()
                   });
                }
             }
          }

          if (phaseTimer <= 0) {
            if (!isYellowPhase && !isAllRedPhase) {
              // GREEN -> YELLOW (4s)
              isYellowPhase = true;
              phaseTimer = 4;
              inter.lanes.forEach(l => {
                if (l.signal === "GREEN") l.signal = "YELLOW";
              });
            } else if (isYellowPhase) {
              // YELLOW -> ALL RED (2s)
              isYellowPhase = false;
              isAllRedPhase = true;
              phaseTimer = 2;
              inter.lanes.forEach(l => l.signal = "RED");
            } else if (isAllRedPhase) {
              // ALL RED -> NEXT PHASE (Standard Rotation)
              isAllRedPhase = false;
              
              // Protocol: Skip high-severity accident lanes in selection or check if we can even turn them green
              const calculateReward = (indices: number[]) => {
                const totalDensity = indices.reduce((sum, i) => sum + inter.lanes[i].densityScore, 0);
                
                // RL Penalty & Severity Logic & Congestion
                const multipliers = indices.map(i => {
                  const l = inter.lanes[i];
                  if (l.downstreamBlocked) return -1.0; // Avoid spillback selection
                  if (!l.accident) return 1.0;
                  
                  // Skip HIGH severity entirely
                  if (l.accidentSeverity === 'HIGH') return -5.0; 
                  if (l.accidentSeverity === 'MEDIUM') return 0.05; 
                  return 0.3; // LOW severity: 30% flow
                });
                
                const avgMultiplier = multipliers.reduce((a, b) => a + b, 0) / multipliers.length;
                return totalDensity * avgMultiplier;
              };

              const nsReward = calculateReward([0, 1]);
              const ewReward = calculateReward([2, 3]);

              if (nsReward >= ewReward) {
                currentPair = "NS";
                inter.lanes[0].signal = "GREEN";
                inter.lanes[1].signal = "GREEN";
                inter.lanes[0].clearedCount = 0; // Reset Y
                inter.lanes[1].clearedCount = 0;
                phaseTimer = calculateOptimalGreen([0, 1]);
              } else {
                currentPair = "EW";
                inter.lanes[2].signal = "GREEN";
                inter.lanes[3].signal = "GREEN";
                inter.lanes[2].clearedCount = 0; // Reset Y
                inter.lanes[3].clearedCount = 0;
                phaseTimer = calculateOptimalGreen([2, 3]);
              }

              // Safety check: if our new pair has an accident, cap the green time
              if (inter.lanes.some((l, idx) => l.signal === "GREEN" && l.accident)) {
                 phaseTimer = Math.min(phaseTimer, 15); // Forced short green for blocked lanes
              }

              inter.alerts.unshift({
                type: "SYSTEM",
                msg: `Signal Rotation: ${currentPair} pair activated for ${phaseTimer}s.`,
                time: new Date().toISOString()
              });
            }
          }
        } else {
          // --- EMERGENCY SEQUENCE STATE MACHINE ---
          phaseTimer--;
          inter.lanes.forEach(l => l.timer = Math.max(0, phaseTimer));

          switch (emergencySequence) {
            case 'INTERRUPTING_YELLOW':
              if (phaseTimer <= 0) {
                  isYellowPhase = false;
                  isAllRedPhase = true;
                  phaseTimer = 2; // All-Red Guard
                  inter.lanes.forEach(l => l.signal = "RED");
                  emergencySequence = 'INTERRUPTING_RED';
              }
              break;

            case 'INTERRUPTING_RED':
              if (phaseTimer <= 0) {
                isAllRedPhase = false;
                emergencySequence = 'SERVING';
                inter.lanes[emergencyLaneIdx!].signal = "GREEN";
                phaseTimer = 30; // Clearance window
                inter.alerts.unshift({
                  type: "EMERGENCY",
                  msg: `EMERGENCY_RELEASE: Priority lane ${inter.lanes[emergencyLaneIdx!].name} GREEN.`,
                  time: new Date().toISOString()
                });
              }
              break;

            case 'SERVING':
              const stillHasAmbulance = inter.lanes[emergencyLaneIdx!].vehicles.some(v => v.priority);
              if (!stillHasAmbulance || phaseTimer <= 0) {
                emergencySequence = 'POST_EMERGENCY_YELLOW';
                inter.lanes[emergencyLaneIdx!].signal = "YELLOW";
                phaseTimer = 4;
                inter.alerts.unshift({
                  type: "SYSTEM",
                  msg: `EMERGENCY_PASS: Priority cleared. Entering discharge transition.`,
                  time: new Date().toISOString()
                });
              }
              break;

            case 'POST_EMERGENCY_YELLOW':
              if (phaseTimer <= 0) {
                emergencySequence = 'POST_EMERGENCY_RED';
                inter.lanes.forEach(l => l.signal = "RED");
                phaseTimer = 2; // Final all-red guard
              }
              break;

            case 'POST_EMERGENCY_RED':
              if (phaseTimer <= 0) {
                // 🔁 RESUME PREVIOUS STATE
                if (savedState) {
                  currentPair = savedState.pair;
                  // AI-Engineer Level: Resume with previous time (clamp to min for safety if needed)
                  phaseTimer = Math.max(15, savedState.timer);
                  
                  inter.lanes.forEach((l, idx) => {
                    const isPairMember = (currentPair === "NS" && (idx === 0 || idx === 1)) || 
                                       (currentPair === "EW" && (idx === 2 || idx === 3));
                    l.signal = isPairMember ? "GREEN" : "RED";
                  });
                  
                  inter.alerts.unshift({
                    type: "SYSTEM",
                    msg: `RESUME_LOGIC: Returning to ${currentPair} pair for ${phaseTimer}s.`,
                    time: new Date().toISOString()
                  });
                }
                // Reset emergency state
                emergencySequence = 'NONE';
                emergencyLaneIdx = null;
                savedState = null;
                isYellowPhase = false;
                isAllRedPhase = false;
              }
              break;
          }
        }

        // 3. Status Update and Alerts
        inter.emergency = inter.lanes.some(l => l.vehicles.some(v => v.priority));
        
        if (inter.alerts.length > 20) inter.alerts.pop();
      });
    } catch (error) {
      console.error('CRITICAL: Simulation loop error:', error);
    }
  }, 1000);

  // --- END SIMULATION ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Traffic Management System active at http://localhost:${PORT}`);
  });
}

startServer();
