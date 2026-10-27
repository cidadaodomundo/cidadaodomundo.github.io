@echo off
rem ==================================================================
rem  CIDADAO DO MUNDO - BLOQUEAR SITES NESTE COMPUTADOR
rem  Deixa abrir so 4 sites: Saipos, Goomer, Printex e Get In.
rem  Vale para Google Chrome, Microsoft Edge e Brave.
rem  Para desfazer: clicar duas vezes no arquivo DESBLOQUEAR-SITES-SALAO
rem ==================================================================
fltmc >nul 2>&1
if errorlevel 1 (
  if "%~1"=="elevado" (
    echo Nao consegui permissao de administrador. NADA FOI MUDADO.
    pause
    exit /b
  )
  echo Pedindo permissao de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList 'elevado' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = [IO.File]::ReadAllText('%~f0'); $m = '::PS-' + 'INICIO::'; Invoke-Expression ($t.Substring($t.LastIndexOf($m) + $m.Length))"
echo.
pause
exit /b

::PS-INICIO::
$ErrorActionPreference = 'Continue'
$pasta = 'C:\CDM-Bloqueio-Sites'
New-Item -ItemType Directory -Path $pasta -Force | Out-Null
$carimbo = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$relatorio = Join-Path $pasta ('bloquear-' + $carimbo + '.txt')

function Diga([string]$t) { Write-Host $t; Add-Content -LiteralPath $relatorio -Value $t }

# Navegadores que recebem a trava (o mesmo jeito de travar serve para os tres)
$navs = [ordered]@{
  'Chrome' = 'HKLM\SOFTWARE\Policies\Google\Chrome'
  'Edge'   = 'HKLM\SOFTWARE\Policies\Microsoft\Edge'
  'Brave'  = 'HKLM\SOFTWARE\Policies\BraveSoftware\Brave'
}

# Enderecos que nunca entram na lista, mesmo que o nome da aba pareca (busca do Google etc.)
$nunca = 'google|bing\.|yahoo|duckduckgo|whatsapp|facebook|instagram|youtube|microsoft|msn\.|live\.com|tiktok|twitter|globo\.|uol\.'

# Endereco que tem o nome do site dentro (conta.saipos.com, painel.goomer..., etc.)
$reEndereco = [regex]'(?i)https?://(?=[a-z0-9\-\.]*(?:saipos|goomer|printex|get-?in))([a-z0-9][a-z0-9\-\.]*)'
# Endereco seguido do nome da aba, do jeito que o Chrome guarda no historico
$reTitulo = [regex]'https?://([A-Za-z0-9][A-Za-z0-9\-\.]*)(?::\d+)?[^\x00-\x20"''<>\\]*?(SAIPOS|Painel Goomer|Printex|Get In)'
$titulos = @{ 'SAIPOS' = 'Saipos'; 'Painel Goomer' = 'Goomer'; 'Printex' = 'Printex'; 'Get In' = 'Get In' }

function SiteDoEndereco([string]$h) {
  if ($h -match 'saipos') { return 'Saipos' }
  if ($h -match 'goomer') { return 'Goomer' }
  if ($h -match 'printex') { return 'Printex' }
  if ($h -match '(^|[\.\-])get-?in') { return 'Get In' }
  return $null
}

# conta.saipos.com -> saipos.com (libera o site inteiro da empresa, com todos os "pedacos")
function Base([string]$h) {
  if ($h -match '^\d{1,3}(\.\d{1,3}){3}$') { return $h }
  $p = $h.Split('.')
  $n = 2
  if ($p.Count -ge 3 -and $p[-1].Length -eq 2 -and (@('com','net','org','gov','edu','app','co','art','ind','inf','srv','tur','eng','blog') -contains $p[-2])) { $n = 3 }
  if ($p.Count -le $n) { return $h }
  return ($p[($p.Count - $n)..($p.Count - 1)] -join '.')
}

function LerTexto([string]$arq) {
  try {
    $info = Get-Item -LiteralPath $arq -ErrorAction Stop
    if ($info.Length -gt 300MB) { return '' }
    $fs = New-Object IO.FileStream($arq, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]'ReadWrite, Delete')
    try {
      $ms = New-Object IO.MemoryStream
      $fs.CopyTo($ms)
      return [Text.Encoding]::GetEncoding(28591).GetString($ms.ToArray())
    } finally { $fs.Close() }
  } catch { return '' }
}

function Principal {
  Diga '=================================================='
  Diga ' CIDADAO DO MUNDO - BLOQUEAR SITES'
  Diga (' Computador: ' + $env:COMPUTERNAME + '   ' + (Get-Date -Format 'dd/MM/yyyy HH:mm'))
  Diga '=================================================='
  Diga ''
  Diga 'Passo 1 de 3 - procurando no Chrome deste computador o endereco certo de cada site...'

  $achados = [ordered]@{}
  foreach ($k in @('Saipos','Goomer','Printex','Get In')) { $achados[$k] = New-Object System.Collections.ArrayList }

  # Historico, favoritos e abas abertas de todos os usuarios e perfis do Chrome/Edge
  $arquivos = @()
  foreach ($u in (Get-ChildItem 'C:\Users' -Directory -ErrorAction SilentlyContinue)) {
    foreach ($nav in @('AppData\Local\Google\Chrome\User Data', 'AppData\Local\Microsoft\Edge\User Data')) {
      $ud = Join-Path $u.FullName $nav
      if (-not (Test-Path -LiteralPath $ud)) { continue }
      foreach ($d in (Get-ChildItem -LiteralPath $ud -Directory -ErrorAction SilentlyContinue)) {
        foreach ($n in @('History', 'Bookmarks', 'Current Session', 'Current Tabs', 'Last Session', 'Last Tabs')) {
          $a = Join-Path $d.FullName $n
          if (Test-Path -LiteralPath $a) { $arquivos += $a }
        }
        $s = Join-Path $d.FullName 'Sessions'
        if (Test-Path -LiteralPath $s) { foreach ($f in (Get-ChildItem -LiteralPath $s -File -ErrorAction SilentlyContinue)) { $arquivos += $f.FullName } }
      }
    }
  }

  foreach ($a in $arquivos) {
    $txt = LerTexto $a
    if (-not $txt) { continue }
    foreach ($m in $reEndereco.Matches($txt)) {
      $h = $m.Groups[1].Value.ToLower().Trim('.')
      $site = SiteDoEndereco $h
      if (-not $site) { continue }
      $b = Base $h
      if (SiteDoEndereco $b) { $e = $b } else { $e = $h }
      if (-not $achados[$site].Contains($e)) { [void]$achados[$site].Add($e) }
    }
    foreach ($m in $reTitulo.Matches($txt)) {
      $h = $m.Groups[1].Value.ToLower().Trim('.')
      if ($h -match $nunca) { continue }
      $site = $titulos[$m.Groups[2].Value]
      $b = Base $h
      if (SiteDoEndereco $b) { $e = $b } else { $e = $h }
      if (-not $achados[$site].Contains($e)) { [void]$achados[$site].Add($e) }
    }
  }

  $faltam = @()
  foreach ($k in $achados.Keys) { if ($achados[$k].Count -eq 0) { $faltam += $k } }
  if ($faltam.Count -gt 0) {
    Diga ''
    Diga ('NAO ACHEI neste computador o endereco de: ' + ($faltam -join ', '))
    Diga ''
    Diga '>>> NADA FOI MUDADO. Nenhum site foi bloqueado. <<<'
    Diga ''
    Diga 'O que fazer: abra esse site uma vez no Chrome deste computador'
    Diga 'e clique de novo duas vezes neste arquivo.'
    return
  }

  $liberar = New-Object System.Collections.ArrayList
  foreach ($k in $achados.Keys) {
    Diga ('   ' + $k + ': ' + ($achados[$k] -join ', '))
    foreach ($e in $achados[$k]) { if (-not $liberar.Contains($e)) { [void]$liberar.Add($e) } }
  }
  # Programas do proprio computador (ex.: impressao) - nao abre nada da internet
  foreach ($e in @('localhost', '127.0.0.1')) { if (-not $liberar.Contains($e)) { [void]$liberar.Add($e) } }

  Diga ''
  Diga 'Passo 2 de 3 - gravando a trava (antes, uma copia de como estava)...'
  foreach ($nome in $navs.Keys) {
    $chave = $navs[$nome]
    & reg.exe query $chave 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { & reg.exe export $chave (Join-Path $pasta ('antes-' + $nome + '-' + $carimbo + '.reg')) /y 2>&1 | Out-Null }
    & reg.exe delete ($chave + '\URLBlocklist') /f 2>&1 | Out-Null
    & reg.exe delete ($chave + '\URLAllowlist') /f 2>&1 | Out-Null
    & reg.exe add ($chave + '\URLBlocklist') /v 1 /t REG_SZ /d '*' /f 2>&1 | Out-Null
    $i = 1
    foreach ($e in $liberar) {
      & reg.exe add ($chave + '\URLAllowlist') /v ([string]$i) /t REG_SZ /d $e /f 2>&1 | Out-Null
      $i++
    }
  }

  Diga ''
  Diga 'Passo 3 de 3 - conferindo...'
  $tudoCerto = $true
  foreach ($nome in $navs.Keys) {
    $chave = 'Registry::' + $navs[$nome].Replace('HKLM\', 'HKEY_LOCAL_MACHINE\')
    $bloq = (Get-ItemProperty -LiteralPath ($chave + '\URLBlocklist') -ErrorAction SilentlyContinue).'1'
    $lista = Get-Item -LiteralPath ($chave + '\URLAllowlist') -ErrorAction SilentlyContinue
    $qtd = 0
    if ($lista) { $qtd = @($lista.Property).Count }
    if ($bloq -eq '*' -and $qtd -eq $liberar.Count) {
      Diga ('   ' + $nome + ': OK - tudo bloqueado, ' + $qtd + ' enderecos liberados')
    } else {
      Diga ('   ' + $nome + ': PROBLEMA - a trava nao gravou direito')
      $tudoCerto = $false
    }
  }

  # Avisa o Chrome que a regra mudou (sem fechar nada)
  Diga '   (aguarde, pode levar ate 1 minuto...)'
  if (Get-Command gpupdate.exe -ErrorAction SilentlyContinue) { cmd.exe /c 'echo N| gpupdate /target:computer /force' 2>&1 | Out-Null }

  $outros = @()
  if ((Test-Path 'C:\Program Files\Mozilla Firefox') -or (Test-Path 'C:\Program Files (x86)\Mozilla Firefox')) { $outros += 'Firefox' }
  if (Get-ChildItem 'C:\Users\*\AppData\Local\Programs\Opera*' -ErrorAction SilentlyContinue) { $outros += 'Opera' }

  Diga ''
  if ($tudoCerto) {
    Diga '>>> PRONTO. Neste computador o Chrome e o Edge so abrem esses 4 sites. <<<'
  } else {
    Diga '>>> ALGO NAO GRAVOU. Tire uma foto desta janela e mande para o Claude. <<<'
  }
  if ($outros.Count -gt 0) { Diga ('ATENCAO: este PC tambem tem ' + ($outros -join ' e ') + ', que NAO ficou bloqueado.') }
  Diga ''
  Diga 'Se o Google ainda abrir: feche o Chrome e abra de novo (sem pedido sendo lancado).'
  Diga 'Para desfazer: clique duas vezes no arquivo DESBLOQUEAR-SITES-SALAO'
  Diga ('Guarde os dois arquivos em ' + $pasta + ' (fora da area de trabalho, longe da equipe).')
  Diga ('Este relatorio ficou guardado em: ' + $relatorio)
}

Principal
