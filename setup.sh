#!/bin/bash

# Intelligent Traffic Management System - Setup & Launch Script

echo "🚀 Starting Intelligent Traffic Management System setup..."

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi

# 2. Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# 3. Setup Python environment (optional but recommended if using CV engine)
if command -v python3 &> /dev/null; then
    echo "🐍 Setting up Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "📦 Installing Python dependencies..."
    pip install -r requirements.txt
else
    echo "⚠️ Python 3 not found. Skipping CV engine setup."
fi

# 4. Setup Environment Variables
if [ ! -f .env ]; then
    echo "🔑 Configuring environment variables..."
    cp .env.example .env
    echo "✅ .env file created from .env.example."
    echo "📝 Please update .env with your GEMINI_API_KEY if needed."
fi

# 5. Launch the Dashboard
echo "🌐 Launching the dashboard..."
# Attempt to open the browser (works on macOS and Windows/WSL/Linux with xdg-open)
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:3000
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:3000
    fi
fi

# Start the dev server
npm run dev
