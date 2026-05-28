@echo off
setlocal

echo 🚀 Starting Intelligent Traffic Management System setup...

:: 1. Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js from https://nodejs.org/
    exit /b 1
)

:: 2. Install Node.js dependencies
echo 📦 Installing Node.js dependencies...
call npm install

:: 3. Setup Python environment
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo 🐍 Setting up Python virtual environment...
    python -m venv venv
    call .\venv\Scripts\activate
    echo 📦 Installing Python dependencies...
    pip install -r requirements.txt
) else (
    echo ⚠️ Python not found. Skipping CV engine setup.
)

:: 4. Setup Environment Variables
if not exist .env (
    echo 🔑 Configuring environment variables...
    copy .env.example .env
    echo ✅ .env file created from .env.example.
    echo 📝 Please update .env with your GEMINI_API_KEY if needed.
)

:: 5. Launch the Dashboard
echo 🌐 Launching the dashboard...
start http://localhost:3000

:: Start the dev server
npm run dev

pause
