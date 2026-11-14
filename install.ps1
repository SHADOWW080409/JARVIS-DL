# JARVIS DL installer: checks Node.js, installs dependencies, optionally starts the app.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js 18+ is required. Install it from https://nodejs.org and re-run this script.' -ForegroundColor Red
  exit 1
}
$major = [int]((node -v).TrimStart('v').Split('.')[0])
if ($major -lt 18) {
  Write-Host "Node $major found; Node 18+ is required." -ForegroundColor Red
  exit 1
}

Write-Host 'Installing dependencies...' -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Done. Start JARVIS DL with: npm start' -ForegroundColor Green
$a = Read-Host 'Start it now? (y/N)'
if ($a -match '^[yY]') { npm start }
