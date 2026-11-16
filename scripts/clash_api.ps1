param([string]$Path = '/proxies', [string]$Method = 'GET', [string]$Body = '')

$ErrorActionPreference = 'Stop'
$pipeName = 'verge-mihomo-production-d82e260b95e32f381c628eab231e3e24e58457194f625d57691c64f0e252de67'

$c = New-Object System.IO.Pipes.NamedPipeClientStream('.', $pipeName, [System.IO.Pipes.PipeDirection]::InOut)
$c.Connect(3000)
$bodyBytes = $null
if ($Body) { $bodyBytes = [Text.Encoding]::UTF8.GetBytes($Body) }
$req = "$Method $Path HTTP/1.1" + "`r`n" + "Host: localhost" + "`r`n" + "Connection: close" + "`r`n"
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
Write-Output $resp
