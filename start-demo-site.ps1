# PowerShell script to start demo site
# Run this in Windows PowerShell (not WSL)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Starting IDS Demo Site" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$projectPath = "C:\Users\rajes\OneDrive\Desktop\Academics\Projects\Capstone\IDS"
$demoSitePath = Join-Path $projectPath "demo-site"
$ipAddress = "172.22.208.1"
$port = 8080

# Check if demo-site directory exists
if (-Not (Test-Path $demoSitePath)) {
    Write-Host "Error: demo-site directory not found at: $demoSitePath" -ForegroundColor Red
    Write-Host "Please check the path and try again." -ForegroundColor Yellow
    exit 1
}

Write-Host "Demo site directory: $demoSitePath" -ForegroundColor Green
Write-Host "Starting HTTP server on $ipAddress`:$port" -ForegroundColor Green
Write-Host ""
Write-Host "Access the demo site at: http://$ipAddress`:$port" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Change to demo-site directory and start server
Set-Location $demoSitePath
python -m http.server $port --bind $ipAddress --directory .

