param([string]$ListFile)
$ErrorActionPreference='Stop'
$Uids = Get-Content $ListFile | ForEach-Object { $_ -split '[\s,]+' } | Where-Object { $_ } | ForEach-Object { [int]$_ }
$out=@()
foreach($u in $Uids){
  $tmp=Join-Path $env:TEMP "lg_$u.html"
  curl.exe -s --max-time 25 -x http://127.0.0.1:7897 "https://www.luogu.com.cn/user/$u" -o $tmp | Out-Null
  if(-not (Test-Path $tmp)){ $out += [pscustomobject]@{uid=$u;name='NO_FILE';ccf=$null;slogan='';rating=$null;reg=$null;rank=$null}; Start-Sleep -Milliseconds 700; continue }
  $h=[IO.File]::ReadAllText($tmp)
  $m=[regex]::Match($h,'(?s)<script id="lentille-context" type="application/json">(.*?)</script>')
  if(-not $m.Success){ $out += [pscustomobject]@{uid=$u;name='FETCH_FAIL';ccf=$null;slogan='';rating=$null;reg=$null;rank=$null}; continue }
  $j=$m.Groups[1].Value | ConvertFrom-Json
  $d=$j.data
  $uobj=$d.user
  $out += [pscustomobject]@{
    uid=$u
    name=$uobj.name
    ccf=$uobj.ccfLevel
    slogan=$uobj.slogan
    rating=$d.gu.rating
    reg=$uobj.registerTime
    rank=$d.gu.ranking
  }
}
$out | Format-Table -AutoSize
