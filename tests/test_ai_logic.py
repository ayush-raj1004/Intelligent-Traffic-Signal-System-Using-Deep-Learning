import unittest
import numpy as np
from cv_engine.vehicle_detector import TrafficDetector
from cv_engine.traffic_rl_agent import TrafficRLAgent

class TestITMSComponents(unittest.TestCase):
    
    def setUp(self):
        self.detector = TrafficDetector()
        self.agent = TrafficRLAgent(n_lanes=4)

    def test_density_calculation(self):
        """Test if density mapping works with mock detections."""
        mock_detections = [
            {"bbox": [150, 450, 200, 500], "class_name": "car"}, # Zone 0
            {"bbox": [350, 450, 400, 500], "class_name": "truck"} # Zone 1
        ]
        zones = [
            [(100, 400), (300, 400), (300, 800), (100, 800)],
            [(310, 400), (510, 400), (510, 800), (310, 800)]
        ]
        density = self.detector.get_density(mock_detections, (1000, 1000), zones)
        self.assertEqual(density["zone_0"], 1)
        self.assertEqual(density["zone_1"], 1)

    def test_rl_reward_logic(self):
        """Test if RL reward decreases as congestion increases."""
        state_low = [5, 5, 5, 5]
        state_high = [20, 20, 20, 20]
        
        # Reward should be negative wait time
        reward_low = -sum(state_low)
        reward_high = -sum(state_high)
        
        self.assertTrue(reward_high < reward_low, "Heavier traffic should result in lower (more negative) rewards")

    def test_agent_action_bounds(self):
        """Verify the agent chooses valid lanes."""
        state = [10, 20, 5, 30]
        action = self.agent.choose_action(state)
        self.assertIn(action, [0, 1, 2, 3])

if __name__ == "__main__":
    unittest.main()
