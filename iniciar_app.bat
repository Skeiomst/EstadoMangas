@echo off
title Estado de Mangas - Iniciador Automatico
echo ========================================================
echo   VERIFICANDO ESTADO DE DOCKER...
echo ========================================================
echo.

REM 1. Intenta obtener info de docker para ver si ya esta corriendo
docker info >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Docker ya esta corriendo.
    goto START_APP
)

REM 2. Si no esta corriendo, lo iniciamos
echo [INFO] Docker no se detecto. Iniciando Docker Desktop...
if exist "Docker Desktop.lnk" (
    start "" "Docker Desktop.lnk"
) else (
    echo [ERROR] No encontre Docker Desktop en la ruta estandar.
    echo Por favor inicialo manualmente.
    pause
    exit
)

REM 3. Bucle de espera hasta que el motor responda
echo [INFO] Esperando a que el motor de Docker arranque (esto puede tardar un poco)...
:WAIT_LOOP
timeout /t 3 /nobreak >nul
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ... cargando motor ...
    goto WAIT_LOOP
)

echo [OK] Docker esta listo!
echo.

:START_APP
echo ========================================================
echo   INICIANDO APLICACION Y TUNEL...
echo   Busca abajo el link que termina en .trycloudflare.com
echo ========================================================
echo.

docker-compose up

pause