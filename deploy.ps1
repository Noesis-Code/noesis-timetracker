# deploy.ps1 — Noèsis TimeTracker
# Volet Déploiement / Mobile, 31 août 2026.
#
# Pourquoi ce script existe : aucune des discussions Claude n'a de terminal sur
# la machine d'Emilien. Elles écrivent les fichiers, mais RIEN n'atteint la
# production tant qu'un `git push` n'a pas été fait à la main. Plusieurs
# correctifs (fuseau horaire, Feuille de temps, verrouillage d'orientation)
# sont ainsi restés sur le disque sans jamais partir en ligne.
#
# Usage, depuis le dossier du projet :
#     .\deploy.ps1
#     .\deploy.ps1 "message de commit"
#
# Le script montre ce qui va partir, commite, pousse, puis attend que Railway
# ait réellement redéployé — il ne rend la main qu'une fois la nouvelle version
# confirmée EN LIGNE, ou après 4 minutes d'attente.

param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$AppUrl = "https://web-production-15a4a.up.railway.app"

function Get-OnlineVersion {
  try {
    $r = Invoke-RestMethod -Uri "$AppUrl/api/version?t=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -TimeoutSec 15
    return $r.version
  } catch {
    return $null
  }
}

# Le projet vit dans OneDrive, qui garde des fichiers ouverts pendant qu'il
# synchronise. Le menage automatique de Git (`gc`) essaie alors de supprimer
# des dossiers de .git/objects que Windows lui refuse, et se met a poser
# "Deletion of directory '.git/objects/xx' failed. Should I try again? (y/n)"
# en boucle, en plein milieu d'un deploiement. Ce menage n'est pas necessaire
# ici : on le desactive une bonne fois (commande sans effet si deja faite).
git config gc.auto 0 | Out-Null

Write-Host ""
Write-Host "=== Ce qui va partir en production ===" -ForegroundColor Cyan
$changes = git status --short
if ([string]::IsNullOrWhiteSpace($changes)) {
  Write-Host "Aucun changement local a deployer." -ForegroundColor Yellow
  Write-Host "Version en ligne actuelle : $(Get-OnlineVersion)"
  exit 0
}
Write-Host $changes

$before = Get-OnlineVersion
Write-Host ""
Write-Host "Version en ligne avant deploiement : $before"

if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = "Mise a jour du " + (Get-Date -Format "dd/MM/yyyy HH:mm")
}

Write-Host ""
Write-Host "=== Commit et push ===" -ForegroundColor Cyan
git add -A
git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "Rien a commiter." -ForegroundColor Yellow }
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Le push a echoue. Rien n'est parti en ligne." -ForegroundColor Red
  Write-Host "Cause la plus frequente : des commits existent sur GitHub et pas ici."
  Write-Host "Lance 'git log --oneline HEAD..origin/main' pour voir lesquels, et demande a Claude avant de forcer quoi que ce soit."
  exit 1
}

Write-Host ""
Write-Host "=== Attente du redeploiement Railway ===" -ForegroundColor Cyan
Write-Host "(le build prend generalement 2 a 3 minutes)"

$deadline = (Get-Date).AddMinutes(4)
$deployed = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 15
  $now = Get-OnlineVersion
  if ($now -and $now -ne $before) {
    Write-Host ""
    Write-Host "En ligne : la version est passee de $before a $now" -ForegroundColor Green
    $deployed = $true
    break
  }
  Write-Host "." -NoNewline
}

if (-not $deployed) {
  Write-Host ""
  Write-Host "Toujours la version $before apres 4 minutes." -ForegroundColor Yellow
  Write-Host "Le push est bien parti : va voir l'onglet Deployments du service 'web' sur Railway,"
  Write-Host "le build a peut-etre echoue (les logs le diront)."
  exit 1
}

Write-Host ""
Write-Host "Sur ton telephone, rouvre l'app : elle se mettra a jour toute seule." -ForegroundColor Green
Write-Host ""
