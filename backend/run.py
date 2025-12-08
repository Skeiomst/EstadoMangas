import uvicorn
import sys
import asyncio
import os

if __name__ == "__main__":
    # --- PARTE CRÍTICA ---
    # Configuramos la política del Event Loop ANTES de que Uvicorn arranque.
    if sys.platform == 'win32':
        # Esto fuerza a Windows a usar el motor que soporta subprocesos (necesario para Playwright)
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    # --- EJECUCIÓN DEL SERVIDOR ---
    # Ejecutamos Uvicorn desde Python directamente
    print("Iniciando servidor con soporte para Playwright en Windows...")
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=False
    )