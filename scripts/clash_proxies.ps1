param([string]$Path = '/proxies/GLOBAL', [string]$Method = 'GET', [string]$Body = '', [string]$SelectName = '')

$ErrorActionPreference = 'Stop'
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

function Split-Resp([string]$resp) {
    $idx = $resp.IndexOf("`r`n`r`n")
    if ($idx -lt 0) { $idx = $resp.IndexOf("`n`n") ; $off = 2 } else { $off = 4 }
    if ($idx -lt 0) { return @{ head = $resp; body = '' } }
    return @{ head = $resp.Substring(0, $idx); body = $resp.Substring($idx + $off) }
}

function Url([string]$s) { [uri]::EscapeDataString($s) }

if ($SelectName) {
    $b = (@{ name = $SelectName } | ConvertTo-Json -Compress)
    $r = Invoke-PipeHttp 'PUT' ("/proxies/" + (Url $Path.Trim('/'))) $b
    $sp = Split-Resp $r
    Write-Output ("select " + $SelectName + " -> " + ($sp.head -split "`n")[0])
} else {
    $r = Invoke-PipeHttp $Method $Path $Body
    $sp = Split-Resp $r
    if ($Path -eq '/proxies/GLOBAL') {
        $g = $sp.body | ConvertFrom-Json
        Write-Output ("GLOBAL now=" + $g.now + " alive=" + $g.alive)
        $g.all | ForEach-Object { Write-Output ("  " + $_) }
    } else {
        Write-Output ($sp.head -split "`n")[0]
        Write-Output $sp.body
    }
}
