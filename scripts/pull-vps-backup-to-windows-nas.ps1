param(
    [string]$VpsHost = "8.136.49.187",
    [string]$VpsUser = "admin",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519_expo_vps",
    [string]$NasRoot = "Z:\ExpoBackups\fuzhou-fishery-expo",
    [string]$RemoteEnvFile = "/opt/expo-server/.env.production",
    [string]$RemoteBackupRoot = "/var/backups/expo-server",
    [int]$RetentionDays = 90,
    [switch]$SkipRemoteBackup
)

$ErrorActionPreference = "Stop"

function New-DirectoryIfMissing {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
}

New-DirectoryIfMissing -Path $NasRoot
$LogRoot = Join-Path $NasRoot "_logs"
New-DirectoryIfMissing -Path $LogRoot
$RunStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogRoot "pull-vps-backup-$RunStamp.log"

function Write-BackupLog {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Assert-CommandExists {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Windows cannot find '$Name'. Please install or enable OpenSSH Client first."
    }
}

function Invoke-External {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )
    Write-BackupLog ("RUN: {0} {1}" -f $FilePath, ($Arguments -join " "))
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath"
    }
}

function Invoke-ExternalCapture {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )
    Write-BackupLog ("RUN: {0} {1}" -f $FilePath, ($Arguments -join " "))
    $output = & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath"
    }
    return (($output | Out-String).Trim())
}

try {
    Write-BackupLog "Starting VPS backup pull to NAS."
    Write-BackupLog "VPS: $VpsUser@$VpsHost"
    Write-BackupLog "NAS root: $NasRoot"
    Write-BackupLog "SSH key: $KeyPath"

    Assert-CommandExists -Name "ssh"
    Assert-CommandExists -Name "scp"

    if (-not (Test-Path -LiteralPath $KeyPath)) {
        throw "SSH key not found: $KeyPath"
    }

    $sshTarget = "${VpsUser}@${VpsHost}"
    $commonSshArgs = @(
        "-i", $KeyPath,
        "-o", "IdentitiesOnly=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        $sshTarget
    )

    if (-not $SkipRemoteBackup) {
        Write-BackupLog "Step 1/4: Ask VPS to create a fresh full backup."
        $remoteBackupCommand = "BACKUP_ENV_FILE='$RemoteEnvFile' bash /opt/expo-server/scripts/backup-sqlite.sh"
        Invoke-External -FilePath "ssh" -Arguments ($commonSshArgs + @($remoteBackupCommand))
    } else {
        Write-BackupLog "Step 1/4: Skipped fresh VPS backup because -SkipRemoteBackup was used."
    }

    Write-BackupLog "Step 2/4: Find latest VPS backup folder."
    $latestCommand = "ls -1dt '$RemoteBackupRoot'/[0-9]* 2>/dev/null | head -1"
    $latestRemotePath = Invoke-ExternalCapture -FilePath "ssh" -Arguments ($commonSshArgs + @($latestCommand))
    if ([string]::IsNullOrWhiteSpace($latestRemotePath)) {
        throw "No remote backup folder found under $RemoteBackupRoot"
    }
    $backupName = ($latestRemotePath.TrimEnd("/") -split "/")[-1]
    if ($backupName -notmatch "^\d{8}-\d{6}$") {
        throw "Unexpected backup folder name: $backupName"
    }
    Write-BackupLog "Latest VPS backup: $latestRemotePath"

    Write-BackupLog "Step 3/4: Download backup folder to NAS."
    $destination = Join-Path $NasRoot $backupName
    $tempDestination = Join-Path $NasRoot "$backupName.downloading"
    if (Test-Path -LiteralPath $tempDestination) {
        Remove-Item -LiteralPath $tempDestination -Recurse -Force
    }
    if (Test-Path -LiteralPath $destination) {
        throw "Destination already exists: $destination"
    }

    $remoteSpec = "${VpsUser}@${VpsHost}:$latestRemotePath"
    Invoke-External -FilePath "scp" -Arguments @(
        "-i", $KeyPath,
        "-o", "IdentitiesOnly=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-r",
        $remoteSpec,
        $tempDestination
    )

    $requiredFiles = @("exhibition.sqlite", "expo-files.tar.gz", "manifest.txt", "backup.log")
    foreach ($fileName in $requiredFiles) {
        $filePath = Join-Path $tempDestination $fileName
        if (-not (Test-Path -LiteralPath $filePath)) {
            throw "Downloaded backup is missing required file: $fileName"
        }
        if ((Get-Item -LiteralPath $filePath).Length -le 0) {
            throw "Downloaded backup file is empty: $fileName"
        }
    }

    $manifestPath = Join-Path $tempDestination "manifest.txt"
    $manifestText = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
    if ($manifestText -notmatch "sqlite_integrity=ok") {
        throw "Manifest does not contain sqlite_integrity=ok"
    }

    Rename-Item -LiteralPath $tempDestination -NewName $backupName
    Write-BackupLog "Downloaded backup saved to: $destination"

    Write-BackupLog "Step 4/4: Clean NAS backups older than $RetentionDays days."
    $cutoff = (Get-Date).AddDays(-1 * $RetentionDays)
    Get-ChildItem -LiteralPath $NasRoot -Directory |
        Where-Object { $_.Name -match "^\d{8}-\d{6}$" -and $_.LastWriteTime -lt $cutoff } |
        ForEach-Object {
            Write-BackupLog "Removing old NAS backup: $($_.FullName)"
            Remove-Item -LiteralPath $_.FullName -Recurse -Force
        }

    Write-BackupLog "Backup pull completed successfully."
    exit 0
} catch {
    Write-BackupLog "ERROR: $($_.Exception.Message)"
    Write-BackupLog "Backup pull failed. Check the log file: $LogFile"
    exit 1
}
