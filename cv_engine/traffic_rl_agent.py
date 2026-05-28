import numpy as np
import random

class TrafficRLAgent:
    def __init__(self, n_lanes=4, n_actions=4):
        self.n_lanes = n_lanes
        self.n_actions = n_actions
        self.q_table = {} # State-Action value mapping
        self.lr = 0.1     # Learning Rate
        self.gamma = 0.9  # Discount Factor
        self.epsilon = 0.2 # Exploration Rate

    def get_state_key(self, density_vector):
        """
        Discretize the density into buckets (e.g., Low, Medium, High).
        density_vector: [lane1_count, lane2_count, ...]
        """
        return tuple([min(2, d // 5) for d in density_vector])

    def choose_action(self, state):
        """
        Epsilon-greedy action selection.
        Returns the lane index to turn Green.
        """
        if random.uniform(0, 1) < self.epsilon:
            return random.randint(0, self.n_actions - 1)
        
        # Get Q-values for this state, default to 0
        state_key = self.get_state_key(state)
        q_values = self.q_table.get(state_key, np.zeros(self.n_actions))
        return np.argmax(q_values)

    def learn(self, state, action, reward, next_state):
        """
        Update the Q-table using the Bellman equation.
        """
        state_key = self.get_state_key(state)
        next_state_key = self.get_state_key(next_state)
        
        if state_key not in self.q_table:
            self.q_table[state_key] = np.zeros(self.n_actions)
        if next_state_key not in self.q_table:
            self.q_table[next_state_key] = np.zeros(self.n_actions)

        # Bellman update
        predict = self.q_table[state_key][action]
        target = reward + self.gamma * np.max(self.q_table[next_state_key])
        self.q_table[state_key][action] += self.lr * (target - predict)

# Example Simulation Integration
def simulate_traffic_step(agent, current_densities):
    # 1. Agent chooses which lane gets green
    action = agent.choose_action(current_densities)
    
    # 2. Apply action: The selected lane clears vehicles, others accumulate
    new_densities = []
    total_wait_time = 0
    for i, d in enumerate(current_densities):
        if i == action:
            # Lane clears (limit by flow rate)
            new_val = max(0, d - 10)
        else:
            # Lane grows (simulated incoming traffic)
            new_val = d + random.randint(0, 3)
        new_densities.append(new_val)
        total_wait_time += d
    
    # 3. Reward Calculation (Negative of total wait time)
    reward = -total_wait_time
    
    # 4. Learn
    agent.learn(current_densities, action, reward, new_densities)
    
    return new_densities, action, reward
