$ErrorActionPreference = 'Stop'
$Python = Join-Path (Get-Location) '.venv\Scripts\python.exe'
if (-not (Test-Path $Python)) { throw 'Virtual environment not found. Run .\install.ps1 first.' }
& $Python .\setup_vnstock_key.py
