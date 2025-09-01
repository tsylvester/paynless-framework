# supabase/scripts/supabase-functions-serve-script.ps1
# Run from repo root: pwsh -File .\supabase\scripts\supabase-functions-serve-script.ps1

$OutDir = Join-Path $PSScriptRoot "..\logs"
New-Item -Type Directory -Force $OutDir | Out-Null

$ts  = Get-Date -Format "yyyyMMdd_HHmmss"
$log = Join-Path $OutDir "supabase_serve_$ts.log"

# cd into supabase/functions (required for env)
Push-Location (Join-Path $PSScriptRoot "..\functions")
try {
  Write-Host "Logging to $log"
  supabase functions serve *>&1 | Tee-Object -FilePath $log -Append
} finally {
  Pop-Location
}