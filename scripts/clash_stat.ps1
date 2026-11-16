param([string]$Action='stat', [string]$Node='')
$ErrorActionPreference='Stop'
$pipeName = 'verge-mihomo-production-d82e260b95e32f381c628eab231e3e24e58457194f625d57691c64f0e252de67'
function Invoke-PipeHttp([string]$method,[string]$path,[string]$body){
  $c = New-Object System.IO.Pipes.NamedPipeClientStream('.', $pipeName, [System.IO.Pipes.PipeDirection]::InOut)
  $c.Connect(3000)
  $bodyBytes=$null
  if($null -ne $body){ $bodyBytes=[Text.Encoding]::UTF8.GetBytes($body) }
  $req="$method $path HTTP/1.1`r`nHost: localhost`r`nConnection: close`r`n"
  if($null -ne $bodyBytes){ $req+="Content-Type: application/json`r`nContent-Length: $($bodyBytes.Length)`r`n" }
  $req+="`r`n"
  $head=[Text.Encoding]::UTF8.GetBytes($req)
  $c.Write($head,0,$head.Length); if($null -ne $bodyBytes){ $c.Write($bodyBytes,0,$bodyBytes.Length) }; $c.Flush()
  $ms = New-Object System.IO.MemoryStream
  $buf = New-Object byte[] 8192
  while($true){ $n=$c.Read($buf,0,$buf.Length); if($n -le 0){break}; $ms.Write($buf,0,$n) }
  $c.Dispose()
  return $ms.ToArray()
}
function BodyText([byte[]]$raw){
  $text=[Text.Encoding]::UTF8.GetString($raw)
  $i=$text.IndexOf("`r`n`r`n"); if($i -lt 0){ return $text }
  $headers=$text.Substring(0,$i); $rest=$raw[($i+4)..($raw.Length-1)]
  if($headers -match 'Transfer-Encoding:\s*chunked'){
    $out=New-Object System.IO.MemoryStream; $pos=0
    while($pos -lt $rest.Length){
      $j=$pos; while(-not($rest[$j] -eq 13 -and $rest[$j+1] -eq 10)){ $j++ }
      $sizeStr=[Text.Encoding]::ASCII.GetString($rest,$pos,$j-$pos)
      $size=[Convert]::ToInt32($sizeStr,16)
      $pos=$j+2
      if($size -eq 0){ break }
      $out.Write($rest,$pos,$size); $pos+=$size+2
    }
    return [Text.Encoding]::UTF8.GetString($out.ToArray())
  }
  return [Text.Encoding]::UTF8.GetString($rest)
}

if($Action -eq 'groups'){
  $j = BodyText (Invoke-PipeHttp 'GET' '/proxies' $null) | ConvertFrom-Json
  $groups = $j.proxies.PSObject.Properties | Where-Object { $_.Value.type -in @('Selector','URLTest','Fallback','LoadBalance') }
  foreach($g in $groups){ Write-Output ("GROUP {0} type={1} now={2} n={3}" -f $g.Name,$g.Value.type,$g.Value.now,$g.Value.all.Count) }
}
elseif($Action -eq 'test'){
  $j = BodyText (Invoke-PipeHttp 'GET' '/proxies' $null) | ConvertFrom-Json
  $all = $j.proxies.'Andy Cloud'.all
  foreach($n in $all){
    if($n -like '*流量*' -or $n -like '*重置*' -or $n -like '*套餐*' -or $n -like '*官网*'){ continue }
    $enc=[uri]::EscapeDataString($n)
    $r = BodyText (Invoke-PipeHttp 'GET' ("/proxies/" + $enc + "/delay?timeout=3000&url=" + [uri]::EscapeDataString('https://www.gstatic.com/generate_204')) $null)
    Write-Output ("{0} => {1}" -f $n, $r.Trim())
  }
}
elseif($Action -eq 'use'){
  $enc=[uri]::EscapeDataString('Andy Cloud')
  $body = @{ name = $Node } | ConvertTo-Json -Compress
  Write-Output (BodyText (Invoke-PipeHttp 'PUT' ("/proxies/" + $enc) $body))
}
