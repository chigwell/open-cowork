# Open Cowork - Windows dependency installer
# Installs Git and Node.js 22+ when missing, then installs npm dependencies.

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Test-Command {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-WithWinget {
    param(
        [string]$Id,
        [string]$Name
    )

    if (-not (Test-Command "winget")) {
        throw "winget is not available. Install 'App Installer' from Microsoft Store, then run this script again."
    }

    Write-Step "Installing $Name"
    winget install --id $Id --exact --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
}

function Get-NodeMajorVersion {
    if (-not (Test-Command "node")) {
        return 0
    }

    $version = (& node --version).Trim().TrimStart("v")
    return [int]($version.Split(".")[0])
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "Open Cowork Windows installer" -ForegroundColor Green
Write-Host "Repository: $repoRoot"

if (-not (Test-Command "git")) {
    Install-WithWinget -Id "Git.Git" -Name "Git"
} else {
    Write-Host "Git is already installed: $(& git --version)" -ForegroundColor Green
}

$nodeMajor = Get-NodeMajorVersion
if ($nodeMajor -lt 22) {
    Install-WithWinget -Id "OpenJS.NodeJS.LTS" -Name "Node.js LTS"
    $nodeMajor = Get-NodeMajorVersion
}

if ($nodeMajor -lt 22) {
    throw "Node.js 22+ is required. Current version: $(& node --version 2>$null). Install Node.js 22+ and run this script again."
}

Write-Host "Node.js is ready: $(& node --version)" -ForegroundColor Green
Write-Host "npm is ready: $(& npm --version)" -ForegroundColor Green

Write-Step "Installing root npm dependencies"
if (Test-Path "package-lock.json") {
    npm ci
} else {
    npm install
}

if (Test-Path "website/package.json") {
    Write-Step "Installing website npm dependencies"
    Push-Location "website"
    try {
        if (Test-Path "package-lock.json") {
            npm ci
        } else {
            npm install
        }
    } finally {
        Pop-Location
    }
}

Write-Step "Done"
Write-Host "Start the app with:" -ForegroundColor Green
Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1" -ForegroundColor Yellow
