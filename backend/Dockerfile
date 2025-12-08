FROM mcr.microsoft.com/playwright/python:v1.40.0-jammy

WORKDIR /app

# Instalar dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Instalar navegadores (solo chromium)
RUN playwright install chromium

# Copiar TODO el código (incluyendo run.py y main.py)
COPY . .

EXPOSE 8000

# CAMBIO AQUÍ: Ejecutamos tu script run.py
CMD ["python", "run.py"]