param([string]$Roster, [string]$SkipNames)
$ErrorActionPreference='Stop'
$text = [IO.File]::ReadAllText($Roster)
$names = [regex]::Matches($text, "\{ name: ""([^""]+)""") | ForEach-Object { $_.Groups[1].Value }
$skip = @()
if($SkipNames){ $skip = (Get-Content $SkipNames -Raw) -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() } }
foreach($n in $names){
  if($skip -contains $n){ continue }
  $enc = [uri]::EscapeDataString($n)
  $tmp = Join-Path $env:TEMP 'lg_search.json'
  $code = curl.exe -s -o $tmp -w "%{http_code}" --max-time 20 -x http://127.0.0.1:7897 "https://www.luogu.com.cn/api/user/search?keyword=$enc"
  $body = ''
  if(Test-Path $tmp){ $body = [IO.File]::ReadAllText($tmp) }
  $users = @()
  try { $users = ($body | ConvertFrom-Json).users } catch {}
  if($users.Count -gt 0){
    $names2 = ($users | ForEach-Object { "$($_.uid):$($_.name)" }) -join ' | '
    "HIT  $n  ->  $names2"
  } else {
    "miss $n"
  }
  Start-Sleep -Milliseconds 600
}
