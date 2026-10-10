$ErrorActionPreference = 'Stop'
$Python = Join-Path (Get-Location) '.venv\Scripts\python.exe'
if (-not (Test-Path $Python)) { throw 'Virtual environment not found. Run .\install.ps1 first.' }
& $Python -m uvicorn main:app --host 127.0.0.1 --port 8000
