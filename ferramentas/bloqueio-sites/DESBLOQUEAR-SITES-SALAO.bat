@echo off
rem ==================================================================
rem  CIDADAO DO MUNDO - DESBLOQUEAR SITES NESTE COMPUTADOR
rem  Desfaz o arquivo BLOQUEAR-SITES-SALAO: todos os sites voltam a abrir.
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
$relatorio = Join-Path $pasta ('desbloquear-' + (Get-Date -Format 'yyyy-MM-dd_HH-mm') + '.txt')

function Diga([string]$t) { Write-Host $t; Add-Content -LiteralPath $relatorio -Value $t }

$navs = [ordered]@{
  'Chrome' = 'HKLM\SOFTWARE\Policies\Google\Chrome'
  'Edge'   = 'HKLM\SOFTWARE\Policies\Microsoft\Edge'
  'Brave'  = 'HKLM\SOFTWARE\Policies\BraveSoftware\Brave'
}

function Principal {
  Diga '=================================================='
  Diga ' CIDADAO DO MUNDO - DESBLOQUEAR SITES'
  Diga (' Computador: ' + $env:COMPUTERNAME + '   ' + (Get-Date -Format 'dd/MM/yyyy HH:mm'))
  Diga '=================================================='
  Diga ''
  $tudoCerto = $true
  foreach ($nome in $navs.Keys) {
    $chave = $navs[$nome]
    & reg.exe delete ($chave + '\URLBlocklist') /f 2>&1 | Out-Null
    & reg.exe delete ($chave + '\URLAllowlist') /f 2>&1 | Out-Null
    $reg = 'Registry::' + $chave.Replace('HKLM\', 'HKEY_LOCAL_MACHINE\')
    if ((Test-Path -LiteralPath ($reg + '\URLBlocklist')) -or (Test-Path -LiteralPath ($reg + '\URLAllowlist'))) {
      Diga ('   ' + $nome + ': PROBLEMA - a trava continua la')
      $tudoCerto = $false
    } else {
      Diga ('   ' + $nome + ': OK - sem trava')
    }
  }
  if (Get-Command gpupdate.exe -ErrorAction SilentlyContinue) { cmd.exe /c 'echo N| gpupdate /target:computer /force' 2>&1 | Out-Null }
  Diga ''
  if ($tudoCerto) {
    Diga '>>> PRONTO. Todos os sites voltaram a abrir neste computador. <<<'
  } else {
    Diga '>>> ALGO NAO SAIU. Tire uma foto desta janela e mande para o Claude. <<<'
  }
  Diga 'Se algum site ainda aparecer bloqueado: feche o Chrome e abra de novo.'
  Diga ('Este relatorio ficou guardado em: ' + $relatorio)
}

Principal
