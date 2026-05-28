import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  AlertCircle, 
  BarChart3, 
  Camera, 
  Clock, 
  Navigation, 
  LayoutDashboard,
  Settings,
  Bell,
  Zap,
  ShieldAlert,
  Ambulance,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- CONSTANTS ---
const LANES = ['North', 'South', 'East', 'West'] as const;
type LaneDirection = typeof LANES[number];

interface Vehicle {
  type: string;
  weight: number;
  color: string;
  priority: boolean;
  plate?: string;
}

interface Lane {
  name: LaneDirection;
  vehicles: Vehicle[];
  signal: 'RED' | 'GREEN' | 'YELLOW';
  densityScore: number;
  timer: number;
  waitTime: number;
  accident?: boolean;
  accidentSeverity?: 'LOW' | 'MEDIUM' | 'HIGH';
  downstreamBlocked: boolean;
  mode: 'NORMAL' | 'EMERGENCY' | 'ACCIDENT' | 'HYBRID';
  redBacklog: number;
  clearedCount: number;
  ambulancePassed?: boolean;
}

interface Intersection {
  id: string;
  name: string;
  lanes: Lane[];
  emergency: boolean;
  alerts: Array<{ type: string; msg: string; time: string }>;
  detectedPlates: string[];
}

// --- SUB-COMPONENTS ---

interface CameraFeedProps {
  lane: Lane;
  sourceType: 'simulation' | 'webcam' | 'file' | 'stream';
  videoUrl: string | null;
  onSourceChange?: (type: 'simulation' | 'webcam' | 'file' | 'stream') => void;
  key?: React.Key;
}

function CameraFeed({ lane, sourceType, videoUrl, onSourceChange }: CameraFeedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  // Webcam Management
  useEffect(() => {
    setWebcamError(null);
    if (sourceType === 'webcam') {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(s => {
          setStream(s);
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(err => {
          console.error("Webcam Access Denied:", err);
          setWebcamError(err.name === 'NotAllowedError' ? "Permission Denied: Please allow camera access in your browser." : "Webcam Error: Could not access video source.");
        });
    } else {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    }
  }, [sourceType]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    // Generate some persistent visual offsets for vehicles so they don't jump
    const vehicleVisuals = lane.vehicles.map((v, i) => ({
      ...v,
      x: (i * 25) % (canvas.width - 20) + 10,
      y: (i * 15) % (canvas.height - 20) + 10,
      offset: i * 0.5
    }));

    const draw = () => {
      frame++;
      
      // Clear canvas (transparent if video is present)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (sourceType === 'simulation') {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < canvas.width; i += 20) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
        }
        for (let j = 0; j < canvas.height; j += 20) {
          ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(canvas.width, j); ctx.stroke();
        }
      }

      // --- VIRTUAL STOP LINE (Visually represented) ---
      const stopLineY = canvas.height * 0.7;
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = lane.signal === 'RED' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(10, stopLineY); ctx.lineTo(canvas.width - 10, stopLineY); ctx.stroke();
      ctx.setLineDash([]);
      
      // Stop Line Label
      ctx.fillStyle = lane.signal === 'RED' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 197, 94, 0.6)';
      ctx.font = 'bold 6px monospace';
      ctx.fillText("VIRTUAL_STOP_LINE", 12, stopLineY - 4);

      // Simulation Vehicles using real backend data
      vehicleVisuals.forEach((v, idx) => {
        const driftX = Math.sin(frame * 0.02 + v.offset) * 5;
        const driftY = Math.cos(frame * 0.01 + v.offset) * 3;
        const bx = v.x + driftX;
        const by = v.y + driftY;
        const bw = 24;
        const bh = 14;
        
        // Priority pulse effect
        if (v.priority) {
          const pulse = (Math.sin(frame * 0.1) + 1) / 2;
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 + pulse * 0.5})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
        }

        // Bounding Box
        ctx.strokeStyle = v.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bw, bh);
        
        // Label Background
        ctx.fillStyle = v.color;
        const labelText = v.type.toUpperCase();
        const priorityText = v.priority ? " [PRIORITY]" : "";
        const fullText = labelText + priorityText;
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        const metrics = ctx.measureText(fullText);
        
        ctx.fillRect(bx, by - 10, metrics.width + 4, 10);
        
        // Label Text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(fullText, bx + 2, by - 2);

        // Simulated Plate detection (Indian HSRP Style)
        if (v.plate && idx < 3) {
           const isScanned = (frame + idx * 50) % 100 < 40; // Simulated scanning state
           if (isScanned) {
             ctx.fillStyle = 'rgba(34, 197, 94, 0.2)'; // Green tint
             ctx.fillRect(bx, by, bw, bh);
             
             // Plate Background
             ctx.fillStyle = '#ffffff';
             ctx.fillRect(bx, by + bh, 56, 10);
             
             // Left Blue Strip (IND)
             ctx.fillStyle = '#0a2351';
             ctx.fillRect(bx, by + bh, 6, 10);
             
             // Chakra simulation
             ctx.fillStyle = '#ffffff';
             ctx.font = '3px sans-serif';
             ctx.fillText("IND", bx + 0.5, by + bh + 7);

             // Plate Number
             ctx.fillStyle = '#1e293b';
             ctx.font = 'bold 7px "JetBrains Mono", monospace';
             ctx.fillText(v.plate, bx + 8, by + bh + 8);
             
             // OCR Scanning line
             ctx.strokeStyle = '#22c55e';
             ctx.lineWidth = 1;
             const scanY = by + (frame % bh);
             ctx.beginPath(); ctx.moveTo(bx, scanY); ctx.lineTo(bx + bw, scanY); ctx.stroke();
           }
        }

        // Tracking corners (reticle effect)
        ctx.strokeStyle = v.color;
        ctx.lineWidth = 0.5;
        // Top-left
        ctx.beginPath(); ctx.moveTo(bx-4, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by-4); ctx.stroke();
        // Bottom-right
        ctx.beginPath(); ctx.moveTo(bx+bw+4, by+bh); ctx.lineTo(bx+bw, by+bh); ctx.lineTo(bx+bw, by+bh+4); ctx.stroke();
      });

      requestAnimationFrame(draw);
    };

    const animReq = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animReq);
  }, [lane.vehicles, sourceType]);

  const getSourceUrl = () => {
    if (sourceType === 'file') return videoUrl;
    if (sourceType === 'stream') return "https://assets.mixkit.co/videos/preview/mixkit-traffic-on-a-highway-street-in-the-city-43254-large.mp4";
    return null;
  };

  return (
    <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-900 group">
      {/* Real Video Layer */}
      {sourceType !== 'simulation' && !webcamError && (
        <video 
          ref={videoRef}
          src={getSourceUrl() || undefined}
          autoPlay 
          muted 
          loop 
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
      )}

      {webcamError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-900/90 text-center z-40">
          <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
          <p className="text-[10px] text-white font-medium">{webcamError}</p>
          <button 
            onClick={() => onSourceChange?.('simulation')}
            className="mt-3 px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] transition-colors"
          >
            Switch to Simulation
          </button>
        </div>
      )}

      {/* AI Overlay Layer */}
      <canvas ref={canvasRef} className="relative z-10 w-full h-full" width={320} height={180} />
      
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(0,0,10,0.02),rgba(0,10,0,0.01),rgba(10,0,0,0.02))] pointer-events-none z-20" />
      
      <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-30">
        <div className="bg-black/60 px-1.5 py-0.5 rounded text-[9px] text-white font-bold border-l-2 border-green-500 flex items-center gap-1.5 backdrop-blur-sm">
          <Camera className="w-2.5 h-2.5" />
          CAM-{lane.name[0]} — {sourceType.toUpperCase()}
        </div>
        {lane.downstreamBlocked && !lane.accident && (
          <div className="bg-amber-600/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded animate-pulse shadow-sm">
            DOWNSTREAM_BLOCKED
          </div>
        )}
        {lane.accident && !lane.ambulancePassed && (
          <div className={cn(
            "text-white text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 animate-bounce shadow-md",
            lane.mode === 'HYBRID' ? "bg-amber-500" : "bg-red-600"
          )}>
            {lane.mode === 'HYBRID' ? <Ambulance className="w-2.5 h-2.5" /> : <ShieldAlert className="w-2.5 h-2.5" />}
            {lane.mode === 'HYBRID' ? 'HYBRID_MODE_ACTIVE' : `ACCIDENT_${lane.accidentSeverity || 'DETECTED'}`}
          </div>
        )}
        {lane.mode === 'HYBRID' && (
           <div className="bg-amber-400 text-black text-[7px] font-black px-1 rounded uppercase tracking-tighter animate-pulse">
             Controlled Slow Discharge
           </div>
        )}
      </div>
      <div className="absolute bottom-2 right-2 flex gap-2 z-30">
        <div className="bg-black/60 px-1.5 py-0.5 rounded text-[9px] text-amber-400 font-mono font-bold backdrop-blur-sm">
          X: {lane.redBacklog || 0} (QUE)
        </div>
        <div className="bg-black/60 px-1.5 py-0.5 rounded text-[9px] text-green-400 font-mono font-bold backdrop-blur-sm">
          Y: {lane.clearedCount || 0} (PASS)
        </div>
        <div className="bg-black/60 px-1.5 py-0.5 rounded text-[9px] text-white/80 font-mono font-bold backdrop-blur-sm border-l border-white/20">
          {lane.vehicles.length} VEH
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<{ intersections: Intersection[] } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [laneSources, setLaneSources] = useState<Record<LaneDirection, 'simulation' | 'webcam' | 'file' | 'stream'>>({
    North: 'simulation',
    South: 'simulation',
    East: 'simulation',
    West: 'simulation'
  });
  const [laneUrls, setLaneUrls] = useState<Record<LaneDirection, string | null>>({
    North: null,
    South: null,
    East: null,
    West: null
  });
  const [selectedLaneConfig, setSelectedLaneConfig] = useState<LaneDirection>('North');

  // Real-time Data Fetching
  useEffect(() => {
    let retryCount = 0;
    let isMounted = true;

    const fetchTraffic = async () => {
      try {
        const response = await fetch('/api/traffic');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (isMounted) {
          setData(result);
          retryCount = 0; 
        }
      } catch (err) {
        if (isMounted) {
          retryCount++;
          console.error(`Traffic Sync Attempt ${retryCount} Failed:`, err);
          // If we have no data, keep trying. If we have old data, also keep trying.
        }
      }
    };
    
    fetchTraffic();
    const trafficInterval = setInterval(fetchTraffic, 1000);
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    
    return () => {
      isMounted = false;
      clearInterval(trafficInterval);
      clearInterval(clockInterval);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setLaneUrls(prev => ({ ...prev, [selectedLaneConfig]: url }));
      setLaneSources(prev => ({ ...prev, [selectedLaneConfig]: 'file' }));
    }
  };

  const triggerPulse = async () => {
    try {
      await fetch('/api/manual/pulse', { method: 'POST' });
    } catch (err) {
      console.error("Pulse Failed:", err);
    }
  };

  if (!data) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
      <Activity className="animate-spin text-blue-600 w-8 h-8" />
      <div className="text-slate-500 font-medium text-sm">Syncing with Traffic Hub...</div>
      <button 
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
      >
        Reload Dashboard
      </button>
    </div>
  );

  const mainIntersection = data.intersections[0];

  const triggerEmergency = async (laneName: string) => {
    try {
      await fetch('/api/manual/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ laneName })
      });
    } catch (err) {
      console.error("Emergency Trigger Failed:", err);
    }
  };

  const triggerAccident = async (laneName: string) => {
    try {
      const lane = mainIntersection.lanes.find(l => l.name === laneName);
      const endpoint = lane?.accident ? '/api/manual/clear-accident' : '/api/manual/accident';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ laneName })
      });
    } catch (err) {
      console.error("Accident Trigger Failed:", err);
    }
  };

  const triggerPhase = async (pair: string) => {
    try {
      await fetch('/api/manual/phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair })
      });
    } catch (err) {
      console.error("Phase Trigger Failed:", err);
    }
  };

  const updateDensity = async (laneName: string, count: number) => {
    try {
      await fetch('/api/manual/density', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ laneName, count })
      });
    } catch (err) {
      console.error("Density Update Failed:", err);
    }
  };

  return (
    <div className="flex h-screen bg-dash-bg overflow-hidden text-dash-text-primary">
      {/* Sidebar */}
      <aside className="w-[220px] bg-white border-r border-dash-border flex flex-col pt-4 shrink-0">
        <div className="px-5 pb-6 border-b border-dash-border mb-4">
          <h2 className="text-[13px] font-semibold text-slate-900 leading-tight">Traffic AI System</h2>
          <p className="text-[11px] text-dash-text-secondary mt-0.5">v1.0 — INT_001</p>
        </div>

        <nav className="flex-1 overflow-y-auto">
          <NavItem icon={<LayoutDashboard className="w-4 h-4" />} label="Live Monitor" active dotColor="#22c55e" />
          <NavItem icon={<Activity className="w-4 h-4" />} label="Signal Control" dotColor="#3b82f6" />
          <NavItem icon={<BarChart3 className="w-4 h-4" />} label="Analytics" dotColor="#f59e0b" />
          <NavItem icon={<Bell className="w-4 h-4" />} label="Alerts" dotColor="#ef4444" />
          
          <div className="mt-4 px-5">
            <button 
              onClick={triggerPulse}
              className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-black tracking-widest flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
            >
              <Zap className="w-3 h-3 fill-current" />
              HYPER PULSE
            </button>
            <p className="text-[8px] text-slate-400 mt-1 text-center italic">Instant re-routing & priority</p>
          </div>

          <div className="mt-6 px-5 pb-2">
             <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Video Input Source</h3>
          </div>

          <div className="px-5 py-2 space-y-3">
            <div className="flex bg-slate-100 p-0.5 rounded-lg">
              {LANES.map(lane => (
                <button 
                  key={lane}
                  onClick={() => setSelectedLaneConfig(lane)}
                  className={cn(
                    "flex-1 py-1 text-[9px] font-bold rounded-md transition-all",
                    selectedLaneConfig === lane 
                      ? "bg-white text-blue-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {lane[0]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-1">
              {[
                { id: 'simulation', label: 'Simulated Feed', icon: <Zap className="w-3 h-3" /> },
                { id: 'webcam', label: 'Live Webcam', icon: <Camera className="w-3 h-3" /> },
                { id: 'stream', label: 'Network Stream', icon: <Activity className="w-3 h-3" /> },
              ].map(src => (
                <button 
                  key={src.id}
                  onClick={() => setLaneSources(prev => ({ ...prev, [selectedLaneConfig]: src.id as any }))}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded transition-all text-[11px] font-semibold border",
                    laneSources[selectedLaneConfig] === src.id 
                      ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm" 
                      : "bg-transparent border-transparent text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {src.icon}
                  {src.label}
                </button>
              ))}
              
              <label 
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded transition-all text-[11px] font-semibold border cursor-pointer",
                  laneSources[selectedLaneConfig] === 'file' 
                    ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm" 
                    : "bg-transparent border-transparent text-slate-600 hover:bg-slate-50"
                )}
              >
                <AlertCircle className="w-3 h-3" />
                Upload Video
                <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
            <p className="text-[9px] text-slate-400 italic text-center">Configuring CAM-{selectedLaneConfig[0]}</p>
          </div>
          
          <div className="mt-4 px-5 pb-2">
             <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Manual Overrides</h3>
          </div>

          <div className="px-5 space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Emergency Pulse</label>
              <div className="grid grid-cols-2 gap-2">
                {LANES.map(lane => (
                  <button 
                    key={lane}
                    id={`btn-emergency-${lane.toLowerCase()}`}
                    onClick={() => triggerEmergency(lane)}
                    className="p-1.5 rounded bg-slate-100 hover:bg-red-100 hover:text-red-600 transition-colors text-[10px] font-bold flex items-center justify-center gap-1 border border-slate-200"
                  >
                    <Ambulance className="w-3 h-3" />
                    {lane[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase text-red-600">Simulate Accident</label>
              <div className="grid grid-cols-2 gap-2">
                {LANES.map(lane => {
                  const isAccident = mainIntersection.lanes.find(l => l.name === lane)?.accident;
                  return (
                    <button 
                      key={lane}
                      id={`btn-accident-${lane.toLowerCase()}`}
                      onClick={() => triggerAccident(lane)}
                      className={cn(
                        "p-1.5 rounded transition-colors text-[10px] font-bold flex items-center justify-center gap-1 border",
                        isAccident 
                          ? "bg-red-600 text-white border-red-700 hover:bg-red-700" 
                          : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                      )}
                    >
                      <ShieldAlert className="w-3 h-3" />
                      {lane[0]} {isAccident ? 'CLR' : 'HIT'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Phase Jump</label>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  id="btn-phase-ns"
                  onClick={() => triggerPhase('NS')}
                  className="p-1.5 rounded bg-slate-100 hover:bg-blue-100 hover:text-blue-600 transition-colors text-[10px] font-bold flex items-center justify-center gap-1 border border-slate-200"
                >
                  <Zap className="w-3 h-3" />
                  NS
                </button>
                <button 
                  id="btn-phase-ew"
                  onClick={() => triggerPhase('EW')}
                  className="p-1.5 rounded bg-slate-100 hover:bg-blue-100 hover:text-blue-600 transition-colors text-[10px] font-bold flex items-center justify-center gap-1 border border-slate-200"
                >
                  <Zap className="w-3 h-3" />
                  EW
                </button>
              </div>
            </div>

            <div className="space-y-2">
               <label className="text-[10px] font-bold text-slate-500 uppercase">Density Load</label>
               {LANES.map(lane => {
                 const ln = mainIntersection.lanes.find(l => l.name === lane);
                 return (
                   <div key={lane} className="flex items-center justify-between gap-3 group">
                      <span className="text-[10px] font-bold text-slate-600">{lane[0]}</span>
                      <input 
                        id={`density-slider-${lane.toLowerCase()}`}
                        type="range" 
                        min="12" 
                        max="35" 
                        value={ln?.vehicles.length || 12}
                        onChange={(e) => updateDensity(lane, parseInt(e.target.value))}
                        className="flex-1 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <span className="text-[10px] font-mono text-slate-400 min-w-4 text-right">{ln?.vehicles.length}</span>
                   </div>
                 );
               })}
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-dash-border">
          <p className="text-[11px] text-dash-text-secondary font-medium mb-2 uppercase tracking-wider">System Status</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_4px_#22c55e88]" />
            <span className="text-xs font-semibold">Nodes Online</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold text-slate-900 tracking-tight">Live Traffic Monitor — Intersection {mainIntersection.id}</h1>
          <div className="flex items-center gap-2">
            <Badge color="green">15.2 FPS</Badge>
            <Badge color="blue">4 Cameras Active</Badge>
            <Badge color="green">RL Dynamic Policy</Badge>
            <Badge color="amber">{currentTime.toLocaleTimeString()}</Badge>
          </div>
        </div>

        {/* Emergency Banner */}
        <AnimatePresence>
          {mainIntersection.emergency && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3 overflow-hidden"
            >
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
              <div className="text-xs text-red-800">
                <span className="font-bold uppercase tracking-tight mr-2">Emergency Override Active</span>
                — Priority vehicle detected in Quadrant — Routing Priority Green
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Metric Grid */}
        <div className="grid grid-cols-4 gap-3">
          <MetricCard 
            label="Total vehicles" 
            value={mainIntersection.lanes.reduce((acc, l) => acc + l.vehicles.length, 0)} 
            sub="Active monitored load" 
          />
          <MetricCard 
            label="Plates Today" 
            value={mainIntersection.detectedPlates.length} 
            sub="ANPR Recognition" 
          />
          <MetricCard 
            label="Avg Queuing Time" 
            value={`${Math.round(mainIntersection.lanes.reduce((acc, l) => acc + l.waitTime, 0) / 4)}s`} 
            sub="Average latency per node" 
          />
          <MetricCard 
            label="Active Incidents" 
            value={mainIntersection.lanes.filter(l => l.accident).length} 
            sub="Accidents reported" 
            danger={mainIntersection.lanes.some(l => l.accident)}
          />
        </div>

        {/* Content Content Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Card: Live Feeds */}
          <Card title="Live camera feeds" subtitle="AI Detection: Multi-Class Bounding Boxes" action={
            <div className="flex gap-2">
              {[
                { label: 'Amb', color: 'bg-red-500' },
                { label: 'Trk', color: 'bg-pink-500' },
                { label: 'Car', color: 'bg-yellow-500' },
                { label: 'Auto', color: 'bg-green-500' },
                { label: 'Bike', color: 'bg-blue-500' },
              ].map(c => (
                <div key={c.label} className="flex items-center gap-1">
                  <div className={cn("w-1.5 h-1.5 rounded-full", c.color)} />
                  <span className="text-[8px] font-bold text-slate-400 uppercase">{c.label}</span>
                </div>
              ))}
            </div>
          }>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {mainIntersection.lanes.map((lane: Lane) => (
                <CameraFeed 
                  key={lane.name} 
                  lane={lane} 
                  sourceType={laneSources[lane.name]} 
                  videoUrl={laneUrls[lane.name]} 
                  onSourceChange={(newSource) => setLaneSources(prev => ({ ...prev, [lane.name]: newSource }))}
                />
              ))}
            </div>
          </Card>

          {/* Card: Signals & Stats */}
          <Card title="Signal status — RL controlled">
            <div className="grid grid-cols-2 gap-2 mt-3">
              {mainIntersection.lanes.map((lane) => (
                <div key={lane.name} className="border border-dash-border rounded-lg p-3 flex flex-col items-center">
                  <span className="text-[10px] text-slate-500 font-bold uppercase mb-2">{lane.name}</span>
                  <div className={cn(
                    "w-7 h-7 rounded-full mb-2",
                    lane.signal === 'GREEN' ? "bg-green-500 shadow-[0_0_8px_#22c55e66]" : 
                    lane.signal === 'YELLOW' ? "bg-amber-400 shadow-[0_0_8px_#fbbf2466]" :
                    "bg-red-500 shadow-[0_0_8px_#ef444466]"
                  )} />
                  <div className="text-xs font-bold tabular-nums flex flex-col items-center gap-0.5">
                    <span>{lane.signal} — {lane.timer}s</span>
                    {lane.mode !== 'NORMAL' && (
                       <span className={cn(
                         "px-1 rounded text-[8px] font-bold uppercase",
                         lane.mode === 'HYBRID' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                       )}>
                         {lane.mode}
                       </span>
                    )}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1 font-mono uppercase bg-slate-50 px-1 rounded">
                    Wait: {lane.waitTime}s
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">Priority Density Score</h4>
              <div className="flex items-end gap-2 h-20 px-2 justify-around">
                {mainIntersection.lanes.map((lane) => (
                  <div key={lane.name} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-[9px] font-bold text-slate-600">{lane.densityScore}</span>
                    <motion.div 
                      layout
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.min(100, lane.densityScore)}%` }}
                      className={cn(
                        "w-full rounded-t-sm transition-colors",
                        lane.densityScore > 60 ? "bg-red-500" : lane.densityScore > 30 ? "bg-amber-500" : "bg-blue-400"
                      )}
                    />
                    <span className="text-[10px] text-slate-400 font-bold">{lane.name[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Card: Number Plates */}
          <Card title="Detected Number Plates" subtitle="ANPR: Optical Character Recognition">
             <div className="h-[250px] overflow-y-auto mt-3 space-y-2 pr-1 custom-scrollbar">
                {mainIntersection.detectedPlates.slice(0, 15).map((plate, idx) => (
                  <motion.div 
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    key={`${plate}-${idx}`}
                    className="flex items-center justify-between p-2 bg-slate-50 border border-dash-border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white border border-slate-300 rounded flex overflow-hidden shadow-sm">
                        <div className="bg-[#0a2351] w-4 flex flex-col items-center justify-center py-0.5">
                          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse mb-0.5" />
                          <span className="text-[5px] text-white font-bold leading-none">IND</span>
                        </div>
                        <div className="px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-800 font-mono">
                          {plate}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium italic">Detected at Cam-{(['N','S','E','W'])[idx % 4]}</span>
                    </div>
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  </motion.div>
                ))}
                {mainIntersection.detectedPlates.length === 0 && (
                  <p className="text-center text-[10px] text-slate-400 py-10">Scanning for number plates...</p>
                )}
             </div>
          </Card>

          {/* Card: Alerts */}
          <Card title="Active alerts" action={<Badge color="red">{mainIntersection.alerts.length}</Badge>}>
            <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto pr-1">
              <AnimatePresence mode="popLayout">
                {mainIntersection.alerts.slice(0, 5).map((alert, i) => (
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    key={`${alert.time}-${i}`}
                    className={cn(
                      "p-3 rounded-lg border flex gap-3 items-start",
                      alert.type === 'EMERGENCY' 
                        ? "bg-red-50 border-red-100 text-red-900" 
                        : "bg-amber-50 border-amber-100 text-amber-900"
                    )}
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-1.5 shrink-0",
                      alert.type === 'EMERGENCY' ? "bg-red-500" : "bg-amber-500"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold leading-tight">{alert.msg}</p>
                      <p className="text-[10px] opacity-60 mt-1">{new Date(alert.time).toLocaleTimeString()}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {mainIntersection.alerts.length === 0 && (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-10 h-10 text-green-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-medium tracking-tight">System state nominal</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function NavItem({ icon, label, active, dotColor }: { icon: React.ReactNode, label: string, active?: boolean, dotColor?: string }) {
  return (
    <button className={cn(
      "w-full flex items-center gap-3 px-5 py-2.5 transition-colors text-[13px] font-medium",
      active ? "bg-slate-50 text-blue-600 border-l-[3px] border-blue-600 pl-[17px]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    )}>
      {dotColor && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />}
      {icon}
      {label}
    </button>
  );
}

function Badge({ children, color }: { children: React.ReactNode, color: 'green' | 'red' | 'amber' | 'blue' }) {
  const styles = {
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-tight", styles[color])}>
      {children}
    </span>
  );
}

function MetricCard({ label, value, sub, danger }: { label: string, value: string | number, sub: string, danger?: boolean }) {
  return (
    <div className={cn(
      "bg-white border rounded-xl p-4 flex flex-col justify-between hover:shadow-md transition-all",
      danger ? "border-red-200 bg-red-50" : "border-dash-border"
    )}>
      <div>
        <h4 className={cn("text-[11px] uppercase font-bold tracking-wider mb-2", danger ? "text-red-600" : "text-slate-500")}>{label}</h4>
        <div className={cn("text-2xl font-bold leading-tight", danger ? "text-red-700" : "text-slate-900")}>{value}</div>
      </div>
      <div className={cn("text-[11px] font-medium mt-1", danger ? "text-red-400" : "text-slate-400")}>{sub}</div>
    </div>
  );
}

function Card({ title, subtitle, children, action }: { title: string, subtitle?: string, children: React.ReactNode, action?: React.ReactNode }) {
  return (
    <div className="bg-white border border-dash-border rounded-2xl p-4 shadow-sm relative overflow-hidden group">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-[13px] font-bold text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-[10px] text-slate-400 font-medium">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

