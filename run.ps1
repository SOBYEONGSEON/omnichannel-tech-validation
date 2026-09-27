param([string]$Task = 'start')
$ErrorActionPreference = 'Stop'
$runtime = Get-ChildItem -LiteralPath "$PSScriptRoot/.tools" -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($runtime) { $env:PATH = "$($runtime.FullName);$env:PATH" }
Set-Location -LiteralPath $PSScriptRoot
$env:PLAYWRIGHT_BROWSERS_PATH = "$PSScriptRoot/.tools/browsers"
& npm.cmd run $Task
exit $LASTEXITCODE
