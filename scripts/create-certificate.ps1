# =============================================================================
# Crear certificado autofirmado para firmar el ejecutable
# =============================================================================
# IMPORTANTE: Este certificado solo funciona en equipos donde se instale
# Para distribucion publica, necesitas un certificado de una CA reconocida
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host @"

  Creador de Certificado para TPV Print Agent
  ============================================

  Este script crea un certificado autofirmado para firmar el instalador.
  El certificado debe instalarse en cada PC donde se use el agente.

"@ -ForegroundColor Cyan

# Nombre del certificado
$CertName = "LMSC TPV Print Agent"
$CertStore = "Cert:\CurrentUser\My"

# Verificar si ya existe
$existing = Get-ChildItem $CertStore | Where-Object { $_.Subject -like "*$CertName*" }
if ($existing) {
    Write-Host "Ya existe un certificado con este nombre." -ForegroundColor Yellow
    $response = Read-Host "Deseas crear uno nuevo? (s/n)"
    if ($response -ne "s") {
        Write-Host "Usando certificado existente: $($existing.Thumbprint)"
        exit 0
    }
    # Eliminar el existente
    $existing | Remove-Item
}

Write-Host "Creando certificado de firma de codigo..." -ForegroundColor Yellow

# Crear certificado autofirmado
$cert = New-SelfSignedCertificate `
    -Subject "CN=$CertName, O=LMSC, L=Spain" `
    -Type CodeSigningCert `
    -KeySpec Signature `
    -KeyLength 2048 `
    -KeyAlgorithm RSA `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -NotBefore (Get-Date) `
    -NotAfter (Get-Date).AddYears(5) `
    -CertStoreLocation $CertStore

Write-Host "Certificado creado: $($cert.Thumbprint)" -ForegroundColor Green

# Exportar certificado publico para instalar en otros PCs
$exportPath = Join-Path $PSScriptRoot "..\installer\LMSC-TPV-Certificate.cer"
Export-Certificate -Cert $cert -FilePath $exportPath -Type CERT | Out-Null

Write-Host ""
Write-Host "Certificado exportado a: $exportPath" -ForegroundColor Green
Write-Host ""
Write-Host @"
PASOS SIGUIENTES:
================

1. Para firmar el instalador, ejecuta:
   .\scripts\sign-installer.ps1

2. Para instalar el certificado en otros PCs (como administrador):
   certutil -addstore "TrustedPublisher" "LMSC-TPV-Certificate.cer"
   certutil -addstore "Root" "LMSC-TPV-Certificate.cer"

3. O doble-click en el archivo .cer y seguir el asistente:
   - Instalar certificado
   - Ubicacion: Equipo local
   - Colocar en: "Editores de confianza" Y "Entidades de certificacion raiz de confianza"

"@ -ForegroundColor Cyan
