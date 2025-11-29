# PowerShell script to start IDS application on Windows
# Run this in PowerShell (right-click -> Run with PowerShell)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Starting IDS Application" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"

# Get the project root directory
$projectRoot = $PSScriptRoot
if (-not $projectRoot) {
    $projectRoot = Get-Location
}

Write-Host "Project root: $projectRoot" -ForegroundColor Green
Write-Host ""

# Function to check if a port is in use
function Test-Port {
    param([int]$Port)
    $connection = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet
    return $connection
}

# Function to check if a process is running
function Test-Process {
    param([string]$ProcessName)
    $process = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
    return $null -ne $process
}

# 1. Check Node.js
Write-Host "[1] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "  ✓ Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js not found! Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# 2. Check Python (for prediction service)
Write-Host "[2] Checking Python..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  ✓ Python installed: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ Python not found - prediction service may not work" -ForegroundColor Yellow
}

# 3. Check MongoDB
Write-Host "[3] Checking MongoDB..." -ForegroundColor Yellow
$mongoRunning = Test-Port -Port 27017
if ($mongoRunning) {
    Write-Host "  ✓ MongoDB appears to be running on port 27017" -ForegroundColor Green
} else {
    Write-Host "  ⚠ MongoDB not detected on port 27017" -ForegroundColor Yellow
    Write-Host "    You may need to start MongoDB manually" -ForegroundColor Yellow
    Write-Host "    Or install MongoDB and start the service" -ForegroundColor Yellow
}

# 4. Check Redis (optional)
Write-Host "[4] Checking Redis..." -ForegroundColor Yellow
$redisRunning = Test-Port -Port 6379
if ($redisRunning) {
    Write-Host "  ✓ Redis appears to be running on port 6379" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Redis not detected on port 6379 (optional)" -ForegroundColor Yellow
}

# 5. Install backend dependencies if needed
Write-Host "[5] Checking backend dependencies..." -ForegroundColor Yellow
$backendPath = Join-Path $projectRoot "backend"
if (-not (Test-Path (Join-Path $backendPath "node_modules"))) {
    Write-Host "  Installing backend dependencies..." -ForegroundColor Yellow
    Set-Location $backendPath
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Failed to install backend dependencies" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Backend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  ✓ Backend dependencies found" -ForegroundColor Green
}

# 6. Build backend if needed
Write-Host "[6] Building backend..." -ForegroundColor Yellow
Set-Location $backendPath
if (-not (Test-Path "dist")) {
    Write-Host "  Building TypeScript..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Failed to build backend" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Backend built successfully" -ForegroundColor Green
} else {
    Write-Host "  ✓ Backend already built" -ForegroundColor Green
}

# 7. Install frontend dependencies if needed
Write-Host "[7] Checking frontend dependencies..." -ForegroundColor Yellow
$frontendPath = Join-Path $projectRoot "frontend"
if (-not (Test-Path (Join-Path $frontendPath "node_modules"))) {
    Write-Host "  Installing frontend dependencies..." -ForegroundColor Yellow
    Set-Location $frontendPath
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Failed to install frontend dependencies" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Frontend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  ✓ Frontend dependencies found" -ForegroundColor Green
}

# 8. Check if ports are available
Write-Host "[8] Checking ports..." -ForegroundColor Yellow
$backendPort = 5001
$frontendPort = 5173
$predictionPort = 5002

if (Test-Port -Port $backendPort) {
    Write-Host "  ⚠ Port $backendPort is already in use (backend)" -ForegroundColor Yellow
    Write-Host "    You may need to stop the existing process" -ForegroundColor Yellow
}

if (Test-Port -Port $frontendPort) {
    Write-Host "  ⚠ Port $frontendPort is already in use (frontend)" -ForegroundColor Yellow
    Write-Host "    You may need to stop the existing process" -ForegroundColor Yellow
}

if (Test-Port -Port $predictionPort) {
    Write-Host "  ⚠ Port $predictionPort is already in use (prediction service)" -ForegroundColor Yellow
}

Write-Host ""

# 9. Start services
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Starting Services" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Start backend in new window
Write-Host "[1] Starting backend server..." -ForegroundColor Yellow
Set-Location $backendPath
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; Write-Host 'Backend Server (Port 5001)' -ForegroundColor Cyan; npm start" -WindowStyle Normal
Start-Sleep -Seconds 3

# Start prediction service in new window (if Python is available)
if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "[2] Starting prediction service..." -ForegroundColor Yellow
    $predictionPath = Join-Path $projectRoot "backend"
    Set-Location $predictionPath
    
    # Check if venv exists
    $venvPath = Join-Path $predictionPath "venv"
    if (Test-Path $venvPath) {
        $pythonExe = Join-Path $venvPath "Scripts\python.exe"
        if (Test-Path $pythonExe) {
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$predictionPath'; Write-Host 'Prediction Service (Port 5002)' -ForegroundColor Cyan; & '$pythonExe' prediction_service.py" -WindowStyle Normal
            Write-Host "  ✓ Prediction service starting..." -ForegroundColor Green
        } else {
            Write-Host "  ⚠ Python venv not found - skipping prediction service" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ⚠ Python venv not found - skipping prediction service" -ForegroundColor Yellow
        Write-Host "    To set up: cd backend; python -m venv venv; .\venv\Scripts\activate; pip install -r requirements.txt" -ForegroundColor Yellow
    }
} else {
    Write-Host "[2] Skipping prediction service (Python not found)" -ForegroundColor Yellow
}

# Start frontend in new window
Write-Host "[3] Starting frontend..." -ForegroundColor Yellow
Set-Location $frontendPath
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; Write-Host 'Frontend Dev Server (Port 5173)' -ForegroundColor Cyan; npm run dev" -WindowStyle Normal
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Services Starting!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:    http://localhost:5001" -ForegroundColor Cyan
Write-Host "Frontend:   http://localhost:5173" -ForegroundColor Cyan
Write-Host "Prediction: http://localhost:5002" -ForegroundColor Cyan
Write-Host ""
Write-Host "Three PowerShell windows have opened:" -ForegroundColor Yellow
Write-Host "  1. Backend server" -ForegroundColor White
Write-Host "  2. Prediction service (if available)" -ForegroundColor White
Write-Host "  3. Frontend dev server" -ForegroundColor White
Write-Host ""
Write-Host "Wait a few seconds for services to start, then open:" -ForegroundColor Yellow
Write-Host "  http://localhost:5173" -ForegroundColor Green -BackgroundColor Black
Write-Host ""
Write-Host "Press any key to exit this script (services will keep running)..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

