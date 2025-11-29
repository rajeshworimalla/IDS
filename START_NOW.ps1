# EMERGENCY START SCRIPT - Gets your app running FAST
# Right-click and "Run with PowerShell"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🚀 STARTING IDS FOR PRESENTATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"
$projectRoot = $PSScriptRoot
if (-not $projectRoot) { $projectRoot = Get-Location }

# Step 1: Install Frontend Dependencies
Write-Host "[1/4] Installing frontend dependencies..." -ForegroundColor Yellow
$frontendPath = Join-Path $projectRoot "frontend"
Set-Location $frontendPath
if (-not (Test-Path "node_modules")) {
    npm install --silent
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Frontend dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Failed to install frontend dependencies" -ForegroundColor Red
    }
} else {
    Write-Host "  ✓ Frontend dependencies already installed" -ForegroundColor Green
}

# Step 2: Install Backend Dependencies
Write-Host "[2/4] Installing backend dependencies..." -ForegroundColor Yellow
$backendPath = Join-Path $projectRoot "backend"
Set-Location $backendPath
if (-not (Test-Path "node_modules")) {
    npm install --silent
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Backend dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Failed to install backend dependencies" -ForegroundColor Red
    }
} else {
    Write-Host "  ✓ Backend dependencies already installed" -ForegroundColor Green
}

# Step 3: Build Backend
Write-Host "[3/4] Building backend..." -ForegroundColor Yellow
Set-Location $backendPath
if (-not (Test-Path "dist")) {
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Backend built successfully" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Failed to build backend" -ForegroundColor Red
        Write-Host "    (Frontend will still work for demo)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✓ Backend already built" -ForegroundColor Green
}

# Step 4: Start Services
Write-Host "[4/4] Starting services..." -ForegroundColor Yellow
Write-Host ""

# Start Backend
Write-Host "Starting backend server..." -ForegroundColor Cyan
Set-Location $backendPath
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; Write-Host '=== BACKEND SERVER (Port 5001) ===' -ForegroundColor Green; npm start" -WindowStyle Minimized
Start-Sleep -Seconds 2

# Start Frontend
Write-Host "Starting frontend dev server..." -ForegroundColor Cyan
Set-Location $frontendPath
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; Write-Host '=== FRONTEND DEV SERVER (Port 5173) ===' -ForegroundColor Green; npm run dev" -WindowStyle Normal
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ SERVICES STARTING!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Open your browser and go to:" -ForegroundColor Yellow
Write-Host "   http://localhost:5173" -ForegroundColor White -BackgroundColor DarkGreen
Write-Host ""
Write-Host "Two PowerShell windows opened:" -ForegroundColor Yellow
Write-Host "  • Backend (minimized)" -ForegroundColor White
Write-Host "  • Frontend (visible)" -ForegroundColor White
Write-Host ""
Write-Host "⏱️  Wait 10-15 seconds for services to start" -ForegroundColor Yellow
Write-Host ""
Write-Host "📊 For your presentation:" -ForegroundColor Cyan
Write-Host "  • Show the UI at http://localhost:5173" -ForegroundColor White
Write-Host "  • Show architecture_diagram_accurate.svg" -ForegroundColor White
Write-Host "  • Explain the system architecture" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to close this window..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

