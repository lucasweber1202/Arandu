<#
.SYNOPSIS
  Prepara o WSL2 e inicia o procedimento de recovery do Arandu (docs/ops/RECOVERY_ORCHESTRATOR.md).

.DESCRIPTION
  1. Verifica Windows, virtualização e WSL2; oferece instalar o Ubuntu 24.04 (com confirmação).
  2. Clona (ou atualiza) o repositório DENTRO do WSL (~/arandu), no SHA revisado.
  3. Executa scripts/recovery/wsl-bootstrap.sh, que pede autorização antes de cada instalação
     e só então inicia o orquestrador. Credenciais são pedidas lá, em entrada oculta.
  Este script não recebe, lê nem grava credenciais e não grava nada no histórico do PowerShell.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Start-AranduRecovery.ps1 -ReviewedSha <40 hex>
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ReviewedSha,
  [string]$Distro = 'Ubuntu-24.04',
  [string]$Repository = 'https://github.com/lucasweber1202/Arandu.git',
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Confirm-Action($m) { (Read-Host "$m [s/N]") -match '^[sS]$' }

Step 'Windows e WSL'
$build = [Environment]::OSVersion.Version.Build
if ($build -lt 19041) { throw "Windows build $build: WSL2 exige Windows 10 2004 (19041) ou superior." }
$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
if (-not $wsl) { throw 'wsl.exe não encontrado. Rode "wsl --install" como administrador e reinicie.' }
$distros = (wsl.exe -l -q) -replace "`0", '' | Where-Object { $_.Trim() }
if ($distros -notcontains $Distro) {
  if (-not (Confirm-Action "A distribuição $Distro não existe. Instalar agora (download da Microsoft Store, ~500 MB)?")) { throw 'Instalação recusada.' }
  wsl.exe --install -d $Distro
  Write-Host 'Conclua a criação do usuário Linux na janela que abrir e execute este launcher de novo.'
  exit 0
}
$version = (wsl.exe -l -v) -replace "`0", '' | Where-Object { $_ -match [regex]::Escape($Distro) }
if ($version -notmatch '\s2\s*$') {
  if (Confirm-Action "$Distro está em WSL1. Converter para WSL2?") { wsl.exe --set-version $Distro 2 } else { throw 'WSL2 é obrigatório.' }
}
$memGb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
Write-Host "  Memória física: $memGb GB (o WSL usa até metade por padrão; mínimo efetivo 4 GB)"

Step 'Repositório dentro do WSL (nunca em /mnt/c)'
$clone = @"
set -euo pipefail
if [ ! -d ~/arandu/.git ]; then git clone --quiet '$Repository' ~/arandu; fi
cd ~/arandu && git fetch --quiet origin && git checkout --quiet --detach '$ReviewedSha'
test "`$(git rev-parse HEAD)" = '$ReviewedSha'
"@
wsl.exe -d $Distro -- bash -lc $clone
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível preparar o repositório no SHA revisado (acesso ao GitHub ou SHA inexistente).' }

Step 'Bootstrap e procedimento (credenciais serão pedidas no terminal Linux, sem eco)'
$flags = "--expect-sha=$ReviewedSha" + $(if ($CheckOnly) { ' --check-only' } else { '' })
wsl.exe -d $Distro -- bash -lc "cd ~/arandu && bash scripts/recovery/wsl-bootstrap.sh $flags"
exit $LASTEXITCODE
