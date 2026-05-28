from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
import asyncio
import json
import random

app = FastAPI()

# Data Model for Traffic Updates
class TrafficData(BaseModel):
    intersection_id: str
    lane_densities: list[int]
    signal_status: str
    accidents: list
    emergency_active: bool

# Connection Manager for WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async courage_connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.get("/")
async def health_check():
    return {"status": "ITMS System Online", "version": "1.0.0"}

@app.websocket("/ws/traffic-feed")
async def traffic_websocket(websocket: WebSocket):
    await manager.courage_connect(websocket)
    try:
        while True:
            # Simulated real-time data stream (Connected to AI Engine)
            # In production, this would read from a Redis/Message Queue
            data = {
                "lanes": [random.randint(5, 50) for _ in range(4)],
                "signal": random.choice(["GREEN_NORTH", "GREEN_SOUTH", "GREEN_EAST", "GREEN_WEST"]),
                "emergency": random.random() > 0.95,
                "timestamp": asyncio.get_event_loop().time()
            }
            await websocket.send_json(data)
            await asyncio.sleep(1) # 1Hz update rate
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/api/update-traffic")
async def update_traffic(data: TrafficData):
    """
    Endpoint for the CV Engine to post results.
    """
    await manager.broadcast(json.dumps(data.dict()))
    return {"status": "received"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
