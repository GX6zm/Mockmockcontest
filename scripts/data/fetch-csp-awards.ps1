# 抓取 data.noip.space 的 CSP-J/S 陕西获奖名单（2023–2024），供 merge-csp.mjs 使用。
#
# 用法（在仓库根目录）：
#   pwsh -File scripts/data/fetch-csp-awards.ps1
#
# 说明：该站是静态表格页，全国名单每页几千到一万多行，直接用无头 Edge 的
# --dump-dom 拿渲染后的 HTML，再交给 extract-csp-awards.py 只保留陕西行。

$ErrorActionPreference = 'Stop'

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { throw "找不到 Edge：$edge" }

$work = Join-Path $env:TEMP 'ns-csp'
New-Item -ItemType Directory -Path $work -Force | Out-Null

$pages = @()
foreach ($year in 2023, 2024) {
  foreach ($group in 'j', 's') {
    foreach ($award in 1, 2, 3) {
      $pages += [pscustomobject]@{
        File = "${year}_${group}${award}.html"
        Url  = "http://data.noip.space/$year/$group$award.html"
      }
    }
  }
}

foreach ($p in $pages) {
  $dst = Join-Path $work $p.File
  if ((Test-Path $dst) -and (Get-Item $dst).Length -gt 1000) {
    Write-Host "跳过（已存在） $($p.File)"
    continue
  }
  Write-Host "抓取 $($p.Url)"
  $profile = Join-Path $env:TEMP ("ns-prof-" + [guid]::NewGuid().ToString('N'))
  & $edge --headless=new --disable-gpu --no-first-run --user-data-dir=$profile `
    --virtual-time-budget=8000 --dump-dom $p.Url 2>$null | Out-File -FilePath $dst -Encoding utf8
  Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
}

$py = 'C:\Users\高新一中\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$env:PYTHONIOENCODING = 'utf-8'
& $py scripts/data/extract-csp-awards.py $work "data/csp-shaanxi.json"
