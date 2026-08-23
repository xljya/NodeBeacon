[CmdletBinding()]
param(
  [int]$IntervalSeconds = 900,
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\artifacts\ripe-atlas\measurements.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw 'PowerShell 7 or newer is required.'
}

if ($IntervalSeconds -lt 60) {
  throw 'IntervalSeconds must be at least 60.'
}

$measurementIntervalSeconds = $IntervalSeconds
$existingMeasurementIds = @(203481343, 203481344, 203481345, 203481346, 203481347)
$nodes = @(
  [pscustomobject]@{ Id = 'rs1000'; SshAlias = 'RS1000' }
  [pscustomobject]@{ Id = 'dmit-uswest'; SshAlias = 'dmit-uswest' }
  [pscustomobject]@{ Id = 'hostbrr-4t'; SshAlias = 'hostbrr-4t' }
  [pscustomobject]@{ Id = 'netcup-1o'; SshAlias = 'netcup-1o' }
  [pscustomobject]@{ Id = 'huawei-2c1g'; SshAlias = 'huawei-2c1g' }
)
$probes = @(
  [pscustomobject]@{
    Id = 1016690
    Key = 'ping'
    Label = 'Ping'
    Provider = 'NodeBeacon Huawei Cloud'
    Asn = 55990
    City = 'Shanghai'
  }
  [pscustomobject]@{
    Id = 1009298
    Key = 'zhejiang_mobile'
    Label = '浙江移动'
    Provider = 'China Mobile'
    Asn = 56041
    City = 'Zhejiang'
  }
  [pscustomobject]@{
    Id = 1009966
    Key = 'zhejiang_unicom'
    Label = '浙江联通'
    Provider = 'China Unicom'
    Asn = 4837
    City = 'Zhejiang'
  }
  [pscustomobject]@{
    Id = 55328
    Key = 'zhejiang_telecom'
    Label = '浙江电信'
    Provider = 'China Telecom'
    Asn = 4134
    City = 'Hangzhou, Zhejiang'
  }
)

function Get-SshPublicIpv4 {
  param([Parameter(Mandatory)][string]$Alias)

  $sshConfig = & ssh -G $Alias 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read SSH configuration for '$Alias'."
  }
  $hostnameLine = $sshConfig |
    Where-Object { $_ -match '^hostname\s+' } |
    Select-Object -First 1
  if (-not $hostnameLine) {
    throw "SSH configuration for '$Alias' has no hostname."
  }

  $hostname = ($hostnameLine -split '\s+', 2)[1].Trim()
  $addresses = [System.Net.Dns]::GetHostAddresses($hostname) |
    Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork }
  $address = $addresses | Select-Object -First 1
  if (-not $address) {
    throw "SSH target '$Alias' does not resolve to IPv4."
  }

  $bytes = $address.GetAddressBytes()
  $isPrivate =
    $bytes[0] -eq 10 -or
    ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or
    ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or
    ($bytes[0] -eq 100 -and $bytes[1] -ge 64 -and $bytes[1] -le 127) -or
    $bytes[0] -eq 127 -or
    ($bytes[0] -eq 169 -and $bytes[1] -eq 254)
  if ($isPrivate) {
    throw "SSH target '$Alias' resolves to a non-public IPv4 address."
  }

  return $address.ToString()
}

function Write-MeasurementArtifact {
  param(
    [Parameter(Mandatory)][long[]]$MeasurementIds,
    [Parameter(Mandatory)][object[]]$ResolvedNodes
  )

  $resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
  $outputDirectory = Split-Path -Parent $resolvedOutputPath
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

  $measurements = for ($index = 0; $index -lt $ResolvedNodes.Count; $index++) {
    [ordered]@{
      nodeId = $ResolvedNodes[$index].Id
      measurementId = $MeasurementIds[$index]
    }
  }
  $artifact = [ordered]@{
    version = 1
    provider = 'ripe-atlas'
    createdAt = [DateTimeOffset]::UtcNow.ToString('o')
    intervalSeconds = $measurementIntervalSeconds
    probes = @($probes | ForEach-Object {
      [ordered]@{
        id = $_.Id
        key = $_.Key
        label = $_.Label
        provider = $_.Provider
        asn = $_.Asn
        city = $_.City
      }
    })
    measurements = @($measurements)
  }

  $temporaryPath = "$resolvedOutputPath.tmp"
  $artifact | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporaryPath -Encoding utf8NoBOM
  Move-Item -LiteralPath $temporaryPath -Destination $resolvedOutputPath -Force
  return $resolvedOutputPath
}

$resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $resolvedOutputPath) {
  throw "Output already exists: $resolvedOutputPath`nRefusing to create duplicate RIPE Atlas measurements."
}

Write-Host 'Checking that the previous NodeBeacon measurements are not still running...'
foreach ($existingId in $existingMeasurementIds) {
  $existing = Invoke-RestMethod -Method Get -Uri "https://atlas.ripe.net/api/v2/measurements/$existingId/"
  if ($existing.status.name -eq 'Ongoing') {
    throw @"
Measurement $existingId is still Ongoing.
Do not create a second set. Use scripts/replace-ripe-atlas-measurements.ps1 to stop extras and recreate at ${measurementIntervalSeconds}s.
"@
  }
}

Write-Host 'Validating RIPE Atlas probes...'
foreach ($probe in $probes) {
  $probeState = Invoke-RestMethod -Method Get -Uri "https://atlas.ripe.net/api/v2/probes/$($probe.Id)/"
  if ($probeState.status.name -ne 'Connected') {
    throw "Probe $($probe.Id) ($($probe.Label)) is not connected."
  }
  if (-not $probeState.is_public) {
    throw "Probe $($probe.Id) ($($probe.Label)) is not public."
  }
  if ([int]$probeState.asn_v4 -ne $probe.Asn) {
    throw "Probe $($probe.Id) ASN changed from expected AS$($probe.Asn) to AS$($probeState.asn_v4)."
  }
}

Write-Host 'Resolving five public NodeBeacon targets from SSH configuration...'
$resolvedNodes = @($nodes | ForEach-Object {
  [pscustomobject]@{
    Id = $_.Id
    Target = Get-SshPublicIpv4 -Alias $_.SshAlias
  }
})

$estimatedCreditsPerDay =
  $resolvedNodes.Count * $probes.Count * (86400 / $measurementIntervalSeconds) * 3
Write-Host ''
Write-Host 'Ready to create recurring public ICMP measurements:'
Write-Host "  Nodes:       $($resolvedNodes.Count)"
Write-Host "  Probes:      $($probes.Count) (Ping / 浙江移动 / 浙江联通 / 浙江电信)"
Write-Host "  Interval:    $measurementIntervalSeconds seconds"
Write-Host "  Estimated:   $estimatedCreditsPerDay credits/day"
Write-Host '  API key:     used once in memory; never written to disk'
Write-Host ''

$confirmation = Read-Host 'Type CREATE to continue'
if ($confirmation -cne 'CREATE') {
  throw 'Cancelled without creating measurements.'
}

$secureApiKey = Read-Host 'RIPE Atlas API UUID' -AsSecureString
$apiKeyPointer = [IntPtr]::Zero
$plainApiKey = $null
try {
  $apiKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)
  $plainApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($apiKeyPointer)
  if ([string]::IsNullOrWhiteSpace($plainApiKey)) {
    throw 'The RIPE Atlas API UUID was empty.'
  }

  $definitions = @($resolvedNodes | ForEach-Object {
    [ordered]@{
      target = $_.Target
      description = "NodeBeacon $($_.Id) Zhejiang three-network latency"
      type = 'ping'
      af = 4
      is_oneoff = $false
      interval = $measurementIntervalSeconds
      packets = 3
      size = 64
      is_public = $true
      resolve_on_probe = $false
      tags = @('nodebeacon', 'zhejiang-three-net', "nodebeacon-$($_.Id)")
    }
  })
  $payload = [ordered]@{
    definitions = $definitions
    probes = @(
      [ordered]@{
        requested = $probes.Count
        type = 'probes'
        value = ($probes.Id -join ',')
      }
    )
  }

  Write-Host 'Creating measurements...'
  try {
    $response = Invoke-RestMethod `
      -Method Post `
      -Uri 'https://atlas.ripe.net/api/v2/measurements/' `
      -Headers @{ Authorization = "Key $plainApiKey" } `
      -ContentType 'application/json' `
      -Body ($payload | ConvertTo-Json -Depth 8 -Compress)
  } catch {
    $apiError = $_.ErrorDetails.Message
    if ($apiError -match 'not have enough credit') {
      throw @"
RIPE Atlas rejected the request because the account has not received its first daily probe-host credit yet.
No measurement was created and no credit was charged.
Keep Probe 1016690 connected, wait for the next daily credit award, confirm the balance is at least $estimatedCreditsPerDay credits, then run this script again.
"@
    }
    if ($apiError) {
      throw "RIPE Atlas rejected the measurement request: $apiError"
    }
    throw
  }

  $measurementIds = @($response.measurements | ForEach-Object { [long]$_ })
  if ($measurementIds.Count -ne $resolvedNodes.Count) {
    throw "RIPE Atlas returned $($measurementIds.Count) measurement IDs; expected $($resolvedNodes.Count)."
  }

  # Persist IDs immediately after the successful API response. The artifact
  # contains no target addresses and no API key, so it is safe for later
  # collector configuration while remaining gitignored.
  $artifactPath = Write-MeasurementArtifact `
    -MeasurementIds $measurementIds `
    -ResolvedNodes $resolvedNodes

  Write-Host ''
  Write-Host 'Created RIPE Atlas measurements successfully:'
  for ($index = 0; $index -lt $resolvedNodes.Count; $index++) {
    Write-Host "  $($resolvedNodes[$index].Id): $($measurementIds[$index])"
  }
  Write-Host "Non-secret artifact: $artifactPath"
} finally {
  $plainApiKey = $null
  if ($apiKeyPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($apiKeyPointer)
  }
}
