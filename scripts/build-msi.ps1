# =============================================================================
# TPV Print Agent - MSI Builder Script
# =============================================================================
# Este script genera un instalador MSI profesional para Windows
# Requiere: WiX Toolset v3.x (https://wixtoolset.org/)
# =============================================================================

param(
    [string]$Version = "1.0.0",
    [switch]$Clean,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Colores para output
function Write-Step { param($msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warning { param($msg) Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host "    [X] $msg" -ForegroundColor Red }

# Banner
Write-Host @"

  _____ ______     __  ____       _       _      _                    _
 |_   _|  _ \ \   / / |  _ \ _ __(_)_ __ | |_   / \   __ _  ___ _ __ | |_
   | | | |_) \ \ / /  | |_) | '__| | '_ \| __| / _ \ / _` |/ _ \ '_ \| __|
   | | |  __/ \ V /   |  __/| |  | | | | | |_ / ___ \ (_| |  __/ | | | |_
   |_| |_|     \_/    |_|   |_|  |_|_| |_|\__/_/   \_\__, |\___|_| |_|\__|
                                                     |___/
                         MSI Installer Builder v1.0
"@ -ForegroundColor Cyan

# Rutas
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }
$DistDir = Join-Path $ProjectRoot "dist"
$InstallerDir = Join-Path $ProjectRoot "installer"
$WixDir = Join-Path $InstallerDir "wix"
$OutputDir = Join-Path $InstallerDir "output"

Write-Host "`nProject Root: $ProjectRoot"
Write-Host "Dist Dir: $DistDir"
Write-Host "Installer Dir: $InstallerDir"

# Verificar WiX Toolset
Write-Step "Verificando WiX Toolset..."

$WixPath = $null
$PossiblePaths = @(
    "C:\Program Files (x86)\WiX Toolset v3.11\bin",
    "C:\Program Files (x86)\WiX Toolset v3.14\bin",
    "C:\Program Files\WiX Toolset v3.11\bin",
    "${env:WIX}bin"
)

foreach ($path in $PossiblePaths) {
    if (Test-Path (Join-Path $path "candle.exe")) {
        $WixPath = $path
        break
    }
}

if (-not $WixPath) {
    Write-Error "WiX Toolset no encontrado!"
    Write-Host "`nPara instalar WiX Toolset:"
    Write-Host "  1. Descarga desde: https://wixtoolset.org/releases/"
    Write-Host "  2. O instala via Chocolatey: choco install wixtoolset"
    Write-Host "  3. O via winget: winget install WixToolset.WixToolset"
    exit 1
}

Write-Success "WiX encontrado en: $WixPath"

$Candle = Join-Path $WixPath "candle.exe"
$Light = Join-Path $WixPath "light.exe"

# Limpiar si se solicita
if ($Clean) {
    Write-Step "Limpiando builds anteriores..."
    if (Test-Path $OutputDir) { Remove-Item -Recurse -Force $OutputDir }
    if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }
    Write-Success "Limpieza completada"
}

# Crear directorio de salida
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Paso 1: Build del ejecutable con pkg
if (-not $SkipBuild) {
    Write-Step "Generando ejecutable con pkg..."

    Push-Location $ProjectRoot
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Error en npm run build"
        }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path (Join-Path $DistDir "tpv-print-agent.exe"))) {
        Write-Error "No se genero el ejecutable"
        exit 1
    }

    Write-Success "Ejecutable generado: dist/tpv-print-agent.exe"
}

# Verificar que existe el ejecutable
$ExePath = Join-Path $DistDir "tpv-print-agent.exe"
if (-not (Test-Path $ExePath)) {
    Write-Error "Ejecutable no encontrado: $ExePath"
    Write-Host "Ejecuta primero: npm run build"
    exit 1
}

# Paso 2: Compilar WXS a WIXOBJ
Write-Step "Compilando WiX source..."

$WxsFile = Join-Path $WixDir "Product.wxs"
$WixObjFile = Join-Path $OutputDir "Product.wixobj"

if (-not (Test-Path $WxsFile)) {
    Write-Error "Archivo WXS no encontrado: $WxsFile"
    exit 1
}

# Actualizar version en el archivo WXS
$WxsContent = Get-Content $WxsFile -Raw
$WxsContent = $WxsContent -replace 'Version="[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"', "Version=`"$Version.0`""
$WxsContent | Set-Content $WxsFile -NoNewline

& $Candle -nologo -out $WixObjFile $WxsFile -ext WixUIExtension

if ($LASTEXITCODE -ne 0) {
    Write-Error "Error al compilar WiX source"
    exit 1
}

Write-Success "WiX object generado"

# Paso 3: Link para generar MSI
Write-Step "Generando instalador MSI..."

$MsiFile = Join-Path $OutputDir "TPV-Print-Agent-$Version.msi"

& $Light -nologo -out $MsiFile $WixObjFile -ext WixUIExtension -cultures:es-ES

if ($LASTEXITCODE -ne 0) {
    Write-Error "Error al generar MSI"
    exit 1
}

if (Test-Path $MsiFile) {
    $MsiSize = [math]::Round((Get-Item $MsiFile).Length / 1MB, 2)
    Write-Success "MSI generado: $MsiFile ($MsiSize MB)"
} else {
    Write-Error "No se genero el archivo MSI"
    exit 1
}

# Limpiar archivos intermedios
Write-Step "Limpiando archivos temporales..."
Remove-Item (Join-Path $OutputDir "*.wixobj") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $OutputDir "*.wixpdb") -ErrorAction SilentlyContinue
Write-Success "Limpieza completada"

# Resumen
Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Green
Write-Host "  BUILD COMPLETADO EXITOSAMENTE" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Green
Write-Host "`n  Instalador: $MsiFile"
Write-Host "  Version:    $Version"
Write-Host "  Tamano:     $MsiSize MB"
Write-Host "`n  Para instalar:"
Write-Host "    msiexec /i `"$MsiFile`""
Write-Host "`n  Para instalar silenciosamente:"
Write-Host "    msiexec /i `"$MsiFile`" /qn"
Write-Host ""
