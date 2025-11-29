# Quick script to just start the frontend (for demo purposes)
# This is the fastest way to get something showing

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Starting Frontend Only (Demo Mode)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = $PSScriptRoot
if (-not $projectRoot) {
    $projectRoot = Get-Location
}

$frontendPath = Join-Path $projectRoot "frontend"

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found!" -ForegroundColor Red
    exit 1
}

# Install dependencies if needed
Set-Location $frontendPath
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Start frontend
Write-Host ""
Write-Host "Starting frontend dev server..." -ForegroundColor Yellow
Write-Host "Frontend will be available at: http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

npm run dev

