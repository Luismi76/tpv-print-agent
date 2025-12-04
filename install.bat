@echo off
REM ============================================
REM TPV Print Agent - Instalador para Windows
REM ============================================

echo.
echo =============================================
echo    TPV Print Agent - Instalador
echo =============================================
echo.

REM Verificar Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js no esta instalado.
    echo.
    echo Por favor, descarga e instala Node.js desde:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js encontrado
for /f "tokens=*" %%i in ('node -v') do echo     Version: %%i
echo.

REM Verificar npm
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm no esta disponible.
    pause
    exit /b 1
)

echo [OK] npm encontrado
echo.

REM Instalar dependencias
echo Instalando dependencias...
echo.
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Error instalando dependencias
    pause
    exit /b 1
)

echo.
echo [OK] Dependencias instaladas
echo.

REM Configurar
echo.
echo Ahora vamos a configurar el agente.
echo.
call npm run configure

echo.
echo =============================================
echo    Instalacion completada!
echo =============================================
echo.
echo Para iniciar el agente, ejecuta:
echo    npm start
echo.
echo O haz doble clic en 'start.bat'
echo.
pause
