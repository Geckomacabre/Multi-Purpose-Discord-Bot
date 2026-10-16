# Keeps the music bot running.
#  - Updates yt-dlp first: YouTube regularly breaks older versions (an outdated
#    yt-dlp gets "HTTP Error 403: Forbidden" and nothing plays).
#  - Runs the bot, and restarts it 10 seconds after it exits for any reason.
#  - Appends output to music-bot.log, rotating it to music-bot.log.old at ~10 MB.
#
# Run it with:  powershell -ExecutionPolicy Bypass -File start.ps1
# Stop it with Ctrl+C (the bot leaves voice channels cleanly).

$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot 'music-bot.log'

function Write-Log($msg) {
    $line = "[$((Get-Date).ToString('s'))] LAUNCHER $msg"
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding utf8
}

function Update-YtDlp {
    $ytdlp = Get-Command yt-dlp -ErrorAction SilentlyContinue
    if (-not $ytdlp) { Write-Log 'yt-dlp is not installed or not on PATH. Music will not play.'; return }
    $before = (& yt-dlp --version) 2>$null
    if ($ytdlp.Source -match 'Python') {
        # Installed with pip: its built-in self-update doesn't work, so use pip.
        & python -m pip install -U --quiet --disable-pip-version-check 'yt-dlp[default]' 2>&1 | Out-Null
    } else {
        & yt-dlp -U 2>&1 | Out-Null
    }
    $after = (& yt-dlp --version) 2>$null
    if ($before -ne $after) { Write-Log "Updated yt-dlp $before -> $after" } else { Write-Log "yt-dlp $after is up to date" }
}

if (-not (Test-Path (Join-Path $PSScriptRoot '.env'))) {
    Write-Host 'No .env file found. Copy .env.example to .env and fill in TOKEN, CLIENT_ID and GUILD_ID first.'
    exit 1
}
if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
    Write-Log 'Installing dependencies...'
    & bun install
}

while ($true) {
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 10MB) {
        Move-Item -Force $log "$log.old"
    }
    Update-YtDlp
    Write-Log 'Starting music bot'
    & bun run index.ts 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $log -Append
    Write-Log "Music bot exited (code $LASTEXITCODE). Restarting in 10 seconds..."
    Start-Sleep -Seconds 10
}
