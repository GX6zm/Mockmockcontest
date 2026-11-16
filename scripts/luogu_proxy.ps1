param([string]$Action = 'on')

$ErrorActionPreference = 'Stop'
$p = Join-Path $env:APPDATA 'io.github.clash-verge-rev.clash-verge-rev'
$src = Join-Path $p 'clash-verge.yaml'
$dst = Join-Path $p 'clash-verge-luogu.yaml'
$pipeName = 'verge-mihomo-production-d82e260b95e32f381c628eab231e3e24e58457194f625d57691c64f0e252de67'

function Invoke-PipeHttp([string]$method, [string]$path, [string]$body) {
    $c = New-Object System.IO.Pipes.NamedPipeClientStream('.', $pipeName, [System.IO.Pipes.PipeDirection]::InOut)
    $c.Connect(3000)
    $bodyBytes = $null
    if ($null -ne $body) { $bodyBytes = [Text.Encoding]::UTF8.GetBytes($body) }
    $req = "$method $path HTTP/1.1" + "`r`n" + "Host: localhost" + "`r`n" + "Connection: close" + "`r`n"
    if ($null -ne $bodyBytes) {
        $req += "Content-Type: application/json" + "`r`n" + "Content-Length: $($bodyBytes.Length)" + "`r`n"
    }
    $req += "`r`n"
    $head = [Text.Encoding]::UTF8.GetBytes($req)
    $c.Write($head, 0, $head.Length)
    if ($null -ne $bodyBytes) { $c.Write($bodyBytes, 0, $bodyBytes.Length) }
    $c.Flush()
    $sr = New-Object System.IO.StreamReader($c)
    $resp = $sr.ReadToEnd()
    $c.Dispose()
    return $resp
}

if ($Action -eq 'on') {
    $s = [IO.File]::ReadAllText($src)
    $nl = "`n"
    if ($s.Contains("`r`n")) { $nl = "`r`n" }
    $key = 'rules:' + $nl
    $idx = $s.IndexOf($key)
    if ($idx -lt 0) { throw 'rules key not found' }
    if ($s.Contains('DOMAIN-SUFFIX,luogu.com.cn')) { throw 'rule already present' }
    $insert = '- DOMAIN-SUFFIX,luogu.com.cn,Andy Cloud' + $nl
    $at = $idx + $key.Length
    $out = $s.Substring(0, $at) + $insert + $s.Substring($at)
    $json = @{ payload = $out; force = $true } | ConvertTo-Json -Compress
    $resp = Invoke-PipeHttp 'PUT' '/configs' $json
    return $resp
}
elseif ($Action -eq 'off') {
    # mihomo refuses PUT /configs {"path":...} unless the file is under SAFE_PATHS,
    # so restore by sending the pristine clash-verge.yaml as a raw payload.
    $s = [IO.File]::ReadAllText($src)
    if ($s.Contains('DOMAIN-SUFFIX,luogu.com.cn')) { throw 'source config already contains the luogu rule' }
    $json = @{ payload = $s; force = $true } | ConvertTo-Json -Compress
    $resp = Invoke-PipeHttp 'PUT' '/configs' $json
    return $resp
}
elseif ($Action -eq 'status') {
    return Invoke-PipeHttp 'GET' '/configs' $null
}
