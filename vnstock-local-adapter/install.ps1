$ErrorActionPreference = 'Stop'

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
  throw 'Python Launcher (py) was not found. Install Python 3.12 from https://www.python.org/downloads/windows/ and enable the Python Launcher.'
}

Write-Host 'Creating Python 3.12 virtual environment...'
py -3.12 -m venv .venv
$Python = Join-Path (Get-Location) '.venv\Scripts\python.exe'
Write-Host 'Installing adapter + VNStock dependencies...'
& $Python -m pip install --upgrade pip
& $Python -m pip install -r requirements.txt
Write-Host ''
Write-Host 'Install complete. Next run: .\setup-key.ps1 (if needed), then .\start-adapter.ps1'
