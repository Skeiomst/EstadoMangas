import os
import sys
import logging
import asyncio
from contextlib import asynccontextmanager
from typing import List, Optional

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from playwright.async_api import async_playwright, Browser, Playwright

# --- CONFIGURACIÓN DE LOGS ---
# Reconfigurar stdout para evitar errores de encoding en Windows
sys.stdout.reconfigure(encoding='utf-8')

# Configuración robusta del logger
logger = logging.getLogger("manga_scraper")
logger.setLevel(logging.INFO)

# Evitar duplicar handlers si se recarga el módulo
if not logger.handlers:
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

# --- VARIABLES GLOBALES PARA PLAYWRIGHT ---
# Mantenemos estas referencias vivas mientras la app corre
playwright_instance: Optional[Playwright] = None
browser_instance: Optional[Browser] = None

# --- CICLO DE VIDA (LIFESPAN) ---
# Esto reemplaza abrir/cerrar el navegador en cada request.
# Se ejecuta UNA vez al arrancar y UNA vez al apagar.
@asynccontextmanager
async def lifespan(app: FastAPI):
    global playwright_instance, browser_instance
    
    playwright_instance = await async_playwright().start()
    
    # Lanzamos el navegador con los argumentos de evasión
    browser_instance = await playwright_instance.chromium.launch(
        headless=True,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-infobars",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--disable-gpu",
            "--disable-setuid-sandbox"
        ]
    )
    
    yield # Aquí la aplicación corre y recibe peticiones
    
    # Limpieza al cerrar la aplicación (Ctrl+C)
    logger.info("Cerrando navegador...")
    if browser_instance:
        await browser_instance.close()
    if playwright_instance:
        await playwright_instance.stop()
    logger.info("Playwright detenido.")

# --- INICIALIZACIÓN DE LA APP ---
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELOS ---
class MangaRequest(BaseModel):
    url: str

class ScanInfo(BaseModel):
    grupo: str
    fecha: str

class MangaResponse(BaseModel):
    url: str
    titulo: str
    imagen: str
    ultimo_capitulo: str
    opciones: List[ScanInfo]
    status: str

# --- ENDPOINT ---
@app.post("/api/scrape-manga", response_model=MangaResponse)
async def scrape_manga(request: MangaRequest):
    global browser_instance
    
    if not browser_instance:
        raise HTTPException(status_code=500, detail="El navegador no está inicializado.")

    url = request.url
    
    # Creamos un contexto aislado (como una pestaña de incógnito nueva)
    # Esto es muy rápido y ligero en comparación con lanzar un browser entero.
    context = await browser_instance.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        viewport={'width': 1920, 'height': 1080},
        locale="es-ES",
        timezone_id="America/Mexico_City"
    )

    # Inyección de scripts de evasión (STEALTH MANUAL)
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.navigator.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    """)

    page = await context.new_page()
    try:
        # 1. Navegación
        try:
            # Usamos domcontentloaded para que sea más rápido, luego esperamos un poco si es necesario
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        except Exception as e:
            logger.error(f"Error cargando URL {url}: {e}")
            raise HTTPException(status_code=400, detail=f"Error de red: {str(e)}")

        # 2. Verificación Cloudflare
        title = await page.title()
        if "Just a moment" in title or "Attention Required" in title:
            logger.warning("Bloqueo de Cloudflare detectado.")
            raise HTTPException(status_code=403, detail="Bloqueo por Cloudflare detectado")

        # Espera táctica para hidratación JS (necesaria para sitios SPA/React como TMO)
        await page.wait_for_timeout(1000)

        # 3. Extracción de Datos
        try:
            titulo_manga = await page.inner_text('h1.element-title', timeout=5000)
            titulo_manga = titulo_manga.strip()
        except:
            # Fallback si no encuentra el título
            titulo_manga = url.split("/")[-1]

        # --- CORRECCIÓN LÓGICA DE IMAGEN ---
        imagen_src = ""
        try:
            imagen_elem = page.locator('img.book-thumbnail').first
            if await imagen_elem.count() > 0:
                # Intento 1: Lazy Loading (data-src)
                imagen_src = await imagen_elem.get_attribute('data-src')
                
                # Intento 2: Estándar (src) si data-src falla
                if not imagen_src:
                    imagen_src = await imagen_elem.get_attribute('src')
                
                # Intento 3: Estilo background-image (a veces pasa)
                if not imagen_src:
                    style = await imagen_elem.get_attribute('style')
                    if style and 'url(' in style:
                        imagen_src = style.split('url(')[1].split(')')[0].replace('"', '').replace("'", "")

            if not imagen_src:
                imagen_src = "" # Aseguramos string vacío en lugar de None
                
        except Exception as e:
            logger.warning(f"No se pudo extraer imagen: {e}")
            imagen_src = ""

        # 4. Extracción de Capítulos
        try:
            selector_capitulo = 'li.list-group-item.p-0.upload-link'
            await page.wait_for_selector(selector_capitulo, timeout=8000)
        except:
            raise HTTPException(status_code=404, detail="No se encontraron capítulos (Timeout)")

        lista_items = await page.locator(selector_capitulo).all()
        if not lista_items:
            raise HTTPException(status_code=404, detail="Lista de capítulos vacía")

        # Tomamos solo el último capítulo (el primero de la lista)
        ultimo_li = lista_items[0]
        
        # Extraer título del capítulo
        try:
            titulo_cap = await ultimo_li.locator('div.col-10.text-truncate').first.inner_text()
            titulo_cap = titulo_cap.strip()
        except:
            titulo_cap = "Capítulo desconocido"
        
        # Extraer scans y fechas
        servidores_elems = await ultimo_li.locator('div.col-4.col-md-6.text-truncate').all()
        fechas_elems = await ultimo_li.locator('span.badge.badge-primary.p-2').all()
        
        grupos_info = []
        for i, serv in enumerate(servidores_elems):
            grupo_texto = await serv.inner_text()
            # Limpieza de espacios extra
            grupo_texto = " ".join(grupo_texto.split())
            
            fecha_texto = "N/A"
            if i < len(fechas_elems):
                fecha_texto = await fechas_elems[i].inner_text()
                fecha_texto = fecha_texto.strip()
                
            grupos_info.append({"grupo": grupo_texto, "fecha": fecha_texto})

        return {
            "url": url,
            "titulo": titulo_manga,
            "imagen": imagen_src,
            "ultimo_capitulo": titulo_cap,
            "opciones": grupos_info,
            "status": "ok"
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error inesperado procesando {url}: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
    
    finally:
        # CRÍTICO: Cerrar el contexto (pestaña) para liberar memoria RAM
        # independientemente de si hubo éxito o error.
        await context.close()