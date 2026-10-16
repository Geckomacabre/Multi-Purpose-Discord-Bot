# Keeps the music bot running.
#  - Prepares Lavalink before each start (lavalink/setup-lavalink.ps1: pinned jars,
#    password, saved YouTube sign-in, config).
#  - Starts Lavalink with Java 21 and waits until it answers before starting the bot.
#  - Runs the bot, and restarts both 10 seconds after the bot exits for any reason.
#    The bot exits on its own if it loses Lavalink for 30 seconds, so a Lavalink
#    crash restarts both too.
#  - Appends bot output to music-bot.log, rotating it to music-bot.log.old at ~10 MB.
#    Lavalink logs to lavalink/logs/ (rotated by Lavalink) and lavalink/stderr.log.
#
# Run it with:  powershell -ExecutionPolicy Bypass -File start.ps1
# Stop it with Ctrl+C (the bot leaves voice channels cleanly).

$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot 'music-bot.log'
$lavaDir = Join-Path $PSScriptRoot 'lavalink'
$lavaJar = Join-Path $lavaDir 'Lavalink.jar'
$entry = Join-Path $PSScriptRoot 'index.ts'
$lavaPort = 2333  # must match server.port in lavalink/application.template.yml

function Write-Log($msg) {
    $line = "[$((Get-Date).ToString('s'))] LAUNCHER $msg"
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding utf8
}

$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envFile)) {
    Write-Log 'No .env file found. Copy .env.example to .env and fill in CLIENT_ID and GUILD_ID first.'
    exit 1
}

# The music bot runs under the main bot's account, so by default it uses the
# main bot's secrets straight from the prod deploy folder: one copy of the token,
# and rotating it there updates both bots. A value filled in .env wins instead.
$prodEnvFiles = 'C:\TMCBot-PROD\secrets.env', 'C:\TMCBot-PROD\bot.env'  # same order as the prod compose file
function Import-ProdSecret($name) {
    if (Select-String -Path $envFile -Pattern "^\s*$name\s*=\s*\S" -Quiet) { return }  # set in .env; Bun loads it
    $value = $null
    foreach ($file in $prodEnvFiles | Where-Object { Test-Path $_ }) {
        $line = Get-Content $file | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -Last 1
        if ($line) { $value = ($line -split '=', 2)[1].Trim().Trim('"', "'") }
    }
    if ($value) { Set-Item "env:$name" $value }
}
Import-ProdSecret 'TOKEN'
if (-not $env:TOKEN -and -not (Select-String -Path $envFile -Pattern '^\s*TOKEN\s*=\s*\S' -Quiet)) {
    Write-Log "No TOKEN in .env or $($prodEnvFiles -join ' / '). The music bot can't log in."
    exit 1
}

# Lavalink 4.2 runs on Java 17+; it's tested here with Java 21 (the default java
# on PATH may be a newer version).
function Find-Java {
    $roots = 'C:\Program Files\Java', 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Microsoft'
    $jdk = Get-ChildItem $roots -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($jdk -and (Test-Path (Join-Path $jdk.FullName 'bin\java.exe'))) { return Join-Path $jdk.FullName 'bin\java.exe' }
    $onPath = Get-Command java -ErrorAction SilentlyContinue
    if ($onPath) { Write-Log "Java 21 not found, using $($onPath.Source)"; return $onPath.Source }
    return $null
}

function Get-EnvValue($name) {
    $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$name\s*=\s*\S" } | Select-Object -Last 1
    if ($line) { return ($line -split '=', 2)[1].Trim().Trim('"', "'") }
    return $null
}

# A stopped scheduled task kills this script but not its children, so clean up
# copies of Lavalink and the bot left over from an earlier run.
function Stop-Leftovers {
    Get-CimInstance Win32_Process -Filter "Name='java.exe' OR Name='bun.exe'" |
        Where-Object { $_.CommandLine -and ($_.CommandLine.Contains($lavaJar) -or $_.CommandLine.Contains($entry)) } |
        ForEach-Object {
            Write-Log "Stopping leftover $($_.Name) (pid $($_.ProcessId))"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

$script:lava = $null

function Start-Lavalink {
    if ($script:lava -and -not $script:lava.HasExited) { return $true }
    $java = Find-Java
    if (-not $java) { Write-Log 'Java is not installed. Install Java 21 (Temurin or Oracle) to run Lavalink.'; return $false }
    # Before every start, so a YouTube sign-in from the last run is saved and used.
    try {
        & (Join-Path $lavaDir 'setup-lavalink.ps1')
    } catch {
        Write-Log "Lavalink setup failed: $_"
        return $false
    }
    Write-Log 'Starting Lavalink'
    # application.yml is read from the working directory.
    $script:lava = Start-Process -FilePath $java -ArgumentList '-Xmx512m', '-jar', "`"$lavaJar`"" `
        -WorkingDirectory $lavaDir -NoNewWindow -PassThru `
        -RedirectStandardOutput (Join-Path $lavaDir 'stdout.log') -RedirectStandardError (Join-Path $lavaDir 'stderr.log')
    $password = Get-EnvValue 'LAVALINK_PASSWORD'
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        if ($script:lava.HasExited) { Write-Log "Lavalink exited during startup (code $($script:lava.ExitCode)). See lavalink/stderr.log and lavalink/logs/."; return $false }
        try {
            $v = Invoke-RestMethod -Uri "http://127.0.0.1:$lavaPort/version" -Headers @{ Authorization = $password } -TimeoutSec 3
            Write-Log "Lavalink $v is ready"
            return $true
        } catch { Start-Sleep -Seconds 1 }
    }
    Write-Log 'Lavalink did not answer within 90 seconds. Restarting it.'
    Stop-Process -Id $script:lava.Id -Force -ErrorAction SilentlyContinue
    return $false
}

try {
    Stop-Leftovers
    # Keeps node_modules in step with package.json after a git pull. Fast when nothing changed.
    & bun install 2>&1 | Out-Null

    while ($true) {
        if ((Test-Path $log) -and (Get-Item $log).Length -gt 10MB) {
            Move-Item -Force $log "$log.old"
        }
        if (-not (Start-Lavalink)) {
            Write-Log 'Retrying in 10 seconds...'
            Start-Sleep -Seconds 10
            continue
        }
        Write-Log 'Starting music bot'
        # Not Tee-Object: on Windows PowerShell 5.1 it appends UTF-16, which garbles a
        # log the launcher writes as UTF-8. The full path to index.ts lets
        # Stop-Leftovers recognise the process.
        & bun run $entry 2>&1 | ForEach-Object {
            $line = "$_"
            Write-Host $line
            Add-Content -Path $log -Value $line -Encoding utf8
        }
        Write-Log "Music bot exited (code $LASTEXITCODE). Restarting in 10 seconds..."
        # Restart Lavalink with the bot, so a stuck Lavalink can't outlive a restart.
        if ($script:lava -and -not $script:lava.HasExited) { Stop-Process -Id $script:lava.Id -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 10
    }
} finally {
    if ($script:lava -and -not $script:lava.HasExited) { Stop-Process -Id $script:lava.Id -Force -ErrorAction SilentlyContinue }
}
