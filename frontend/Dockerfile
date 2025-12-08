# Etapa 1: Construcción
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etapa 2: Servidor Producción (Nginx)
FROM nginx:alpine
# Copiamos los archivos compilados de la etapa anterior
COPY --from=build /app/dist /usr/share/nginx/html
# Copiamos nuestra configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]