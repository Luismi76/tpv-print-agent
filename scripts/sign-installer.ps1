# =============================================================================
# Firmar el instalador MSI y ejecutable
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host @"

  Firmador de Instalador TPV Print Agent
  =======================================

"@ -ForegroundColor Cyan

# Buscar certificado
$CertName = "LMSC TPV Print Agent"
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*$CertName*" }

if (-not $cert) {
    Write-Host "ERROR: No se encontro el certificado." -ForegroundColor Red
    Write-Host "Ejecuta primero: .\scripts\create-certificate.ps1"
    exit 1
}

Write-Host "Usando certificado: $($cert.Thumbprint)" -ForegroundColor Green

# Rutas
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }

$ExePath = Join-Path $ProjectRoot "dist\tpv-print-agent.exe"
$MsiPath = Get-ChildItem (Join-Path $ProjectRoot "installer\output\*.msi") -ErrorAction SilentlyContinue | Select-Object -First 1

# Firmar ejecutable
if (Test-Path $ExePath) {
    Write-Host "Firmando ejecutable..." -ForegroundColor Yellow
    Set-AuthenticodeSignature -FilePath $ExePath -Certificate $cert -TimestampServer "http://timestamp.digicert.com"
    Write-Host "  OK: $ExePath" -ForegroundColor Green
} else {
    Write-Host "  No encontrado: $ExePath" -ForegroundColor Yellow
}

# Firmar MSI
if ($MsiPath) {
    Write-Host "Firmando MSI..." -ForegroundColor Yellow

    # Para MSI necesitamos signtool (parte del Windows SDK)
    $signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue | Select-Object -Last 1

    if ($signtool) {
        & $signtool.FullName sign /sha1 $cert.Thumbprint /fd SHA256 /tr "http://timestamp.digicert.com" /td SHA256 $MsiPath.FullName
        Write-Host "  OK: $($MsiPath.Name)" -ForegroundColor Green
    } else {
        Write-Host "  signtool.exe no encontrado. Instala Windows SDK para firmar MSI." -ForegroundColor Yellow
        Write-Host "  El ejecutable ya esta firmado, el MSI funcionara pero mostrara advertencia." -ForegroundColor Yellow
    }
} else {
    Write-Host "  No se encontro archivo MSI en installer\output\" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Firma completada!" -ForegroundColor Green
Write-Host ""
Write-Host @"
NOTA: Para que el aviso de SmartScreen desaparezca en otros PCs,
debes instalar el certificado en esos equipos:

  certutil -addstore "TrustedPublisher" "installer\LMSC-TPV-Certificate.cer"
  certutil -addstore "Root" "installer\LMSC-TPV-Certificate.cer"

"@ -ForegroundColor Cyan
