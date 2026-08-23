[CmdletBinding()]
param(
  [int]$IntervalSeconds = 900,
  [switch]$Force,
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

$currentMeasurementIds = @(203481343, 203481344, 203481345, 203481346, 203481347)
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

function Get-PlainApiKey {
  $fromEnv = [Environment]::GetEnvironmentVariable('RIPE_ATLAS_API_KEY')
  if (-not [string]::IsNullOrWhiteSpace($fromEnv)) {
    return $fromEnv.Trim()
  }

  $secureApiKey = Read-Host 'RIPE Atlas API UUID' -AsSecureString
  $apiKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)
  try {
    $plainApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($apiKeyPointer)
    if ([string]::IsNullOrWhiteSpace($plainApiKey)) {
      throw 'The RIPE Atlas API UUID was empty.'
    }
    return $plainApiKey.Trim()
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($apiKeyPointer)
  }
}

function Invoke-RipeAtlas {
  param(
    [Parameter(Mandatory)][string]$Method,
    [Parameter(Mandatory)][string]$Uri,
    [Parameter(Mandatory)][string]$ApiKey,
    [object]$Body
  )

  $headers = @{ Authorization = "Key $ApiKey" }
  $params = @{
    Method = $Method
    Uri = $Uri
    Headers = $headers
  }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }

  try {
    return Invoke-RestMethod @params
  } catch {
    $apiError = $_.ErrorDetails.Message
    if ($apiError) {
      throw "RIPE Atlas $Method $Uri failed: $apiError"
    }
    throw
  }
}

function Get-OngoingMeasurements {
  param([Parameter(Mandatory)][string]$ApiKey)

  $results = @()
  $uri = 'https://atlas.ripe.net/api/v2/measurements/my/?status=1,2&page_size=100'
  while ($uri) {
    $page = Invoke-RipeAtlas -Method Get -Uri $uri -ApiKey $ApiKey
    $results += @($page.results)
    $uri = $page.next
  }
  return $results
}

function Get-DailyCreditEstimate {
  param($Measurement)

  $interval = [int]($Measurement.interval)
  $packetsOrCost = [int]($Measurement.credits_per_result)
  $probes = [int]($Measurement.probes_scheduled)
  if ($interval -le 0 -or $packetsOrCost -le 0 -or $probes -le 0) {
    return $null
  }
  return [math]::Round($probes * (86400 / $interval) * $packetsOrCost, 1)
}

function Write-MeasurementSummary {
  param($Measurement)

  $status = $Measurement.status
  $statusName = if ($status -is [pscustomobject] -or $status -is [hashtable]) { $status.name } else { $status }
  $credits = Get-DailyCreditEstimate -Measurement $Measurement
  $creditText = if ($null -eq $credits) { 'n/a' } else { "$credits/day" }
  $oneOff = if ($Measurement.is_oneoff) { ' one-off' } else { '' }
  Write-Host ("  {0}  {1}{2}  interval={3}s  probes={4}  cost/result={5}  ~{6}  {7}" -f `
    $Measurement.id, $Measurement.type, $oneOff, $Measurement.interval, `
    $Measurement.probes_scheduled, $Measurement.credits_per_result, $creditText, $Measurement.description)
}

function Stop-RipeMeasurement {
  param(
    [Parameter(Mandatory)][long]$Id,
    [Parameter(Mandatory)][string]$ApiKey
  )

  $null = Invoke-RipeAtlas `
    -Method Delete `
    -Uri "https://atlas.ripe.net/api/v2/measurements/$Id/" `
    -ApiKey $ApiKey
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
    createdAt = [DateTimeOffset]::Now.ToString('o')
    intervalSeconds = $IntervalSeconds
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

$plainApiKey = $null
try {
  $plainApiKey = Get-PlainApiKey

  Write-Host 'Reading credit balance and ongoing measurements...'
  $credits = Invoke-RipeAtlas -Method Get -Uri 'https://atlas.ripe.net/api/v2/credits/' -ApiKey $plainApiKey
  $ongoing = @(Get-OngoingMeasurements -ApiKey $plainApiKey)
  $keepIds = [System.Collections.Generic.HashSet[long]]::new()
  foreach ($id in $currentMeasurementIds) { [void]$keepIds.Add([long]$id) }

  $keep = @($ongoing | Where-Object { $keepIds.Contains([long]$_.id) })
  $extra = @($ongoing | Where-Object { -not $keepIds.Contains([long]$_.id) })
  $estimatedKeep = ($keep | ForEach-Object { Get-DailyCreditEstimate -Measurement $_ } | Measure-Object -Sum).Sum
  $estimatedExtra = ($extra | ForEach-Object { Get-DailyCreditEstimate -Measurement $_ } | Measure-Object -Sum).Sum
  $estimatedNew = $nodes.Count * $probes.Count * (86400 / $IntervalSeconds) * 3

  Write-Host ''
  Write-Host "Balance:               $($credits.current_balance)"
  Write-Host "Estimated income/day:  $($credits.estimated_daily_income)"
  Write-Host "Estimated spend/day:   $($credits.estimated_daily_expenditure)"
  Write-Host "Ongoing UDMs:          $($ongoing.Count)"
  Write-Host "NodeBeacon keep:       $($keep.Count)  (~$estimatedKeep credits/day)"
  Write-Host "Other ongoing:         $($extra.Count)  (~$estimatedExtra credits/day)"
  Write-Host "Replacement interval:  $IntervalSeconds seconds"
  Write-Host "Replacement budget:    $estimatedNew credits/day"
  Write-Host ''
  Write-Host 'NodeBeacon measurements to replace:'
  if ($keep.Count -eq 0) {
    Write-Host '  (none currently ongoing; will still create a new 5-node set)'
  } else {
    $keep | ForEach-Object { Write-MeasurementSummary -Measurement $_ }
  }
  Write-Host 'Other ongoing measurements to stop:'
  if ($extra.Count -eq 0) {
    Write-Host '  (none found via /measurements/my/; private/shared-access spend may still exist)'
  } else {
    $extra | ForEach-Object { Write-MeasurementSummary -Measurement $_ }
  }

  $confirmEnv = [Environment]::GetEnvironmentVariable('RIPE_ATLAS_CONFIRM')
  if (-not $Force -and $confirmEnv -cne 'REPLACE') {
    $confirmation = Read-Host 'Type REPLACE to stop extras, create the new 900s set, then stop the old NodeBeacon IDs'
    if ($confirmation -cne 'REPLACE') {
      throw 'Cancelled without changing measurements.'
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

  foreach ($measurement in $extra) {
    Write-Host "Stopping extra measurement $($measurement.id)..."
    Stop-RipeMeasurement -Id ([long]$measurement.id) -ApiKey $plainApiKey
  }

  $definitions = @($resolvedNodes | ForEach-Object {
    [ordered]@{
      target = $_.Target
      description = "NodeBeacon $($_.Id) Zhejiang three-network latency"
      type = 'ping'
      af = 4
      is_oneoff = $false
      interval = $IntervalSeconds
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

  Write-Host "Creating replacement measurements at ${IntervalSeconds}s..."
  $response = Invoke-RipeAtlas `
    -Method Post `
    -Uri 'https://atlas.ripe.net/api/v2/measurements/' `
    -ApiKey $plainApiKey `
    -Body $payload
  $measurementIds = @($response.measurements | ForEach-Object { [long]$_ })
  if ($measurementIds.Count -ne $resolvedNodes.Count) {
    throw "RIPE Atlas returned $($measurementIds.Count) measurement IDs; expected $($resolvedNodes.Count)."
  }

  $artifactPath = Write-MeasurementArtifact `
    -MeasurementIds $measurementIds `
    -ResolvedNodes $resolvedNodes

  foreach ($oldId in $currentMeasurementIds) {
    $stillRunning = $keep | Where-Object { [long]$_.id -eq $oldId }
    if (-not $stillRunning) {
      continue
    }
    Write-Host "Stopping old NodeBeacon measurement $oldId..."
    Stop-RipeMeasurement -Id $oldId -ApiKey $plainApiKey
  }

  Write-Host ''
  Write-Host 'Replacement complete. New public measurement IDs:'
  for ($index = 0; $index -lt $resolvedNodes.Count; $index++) {
    Write-Host "  $($resolvedNodes[$index].Id): $($measurementIds[$index])"
  }
  Write-Host "Non-secret artifact: $artifactPath"
  Write-Host 'Update infra/k8s/configmap-ripe-atlas.yaml from this artifact, then publish.'
} finally {
  $plainApiKey = $null
  Remove-Item Env:RIPE_ATLAS_API_KEY -ErrorAction SilentlyContinue
}
