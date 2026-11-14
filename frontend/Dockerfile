# Frontend Meowrizon: React + TypeScript + Vite + CesiumJS.
# Si costruisce dalla radice del repository (workspace npm con package-lock.json nella radice):
#   docker compose build frontend           immagine di sviluppo (target dev)
#   docker compose --profile prod build web immagine di produzione (target prod, nginx)

# Versione di Node da .nvmrc
FROM node:22.22.1-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
RUN npm ci --no-audit --no-fund

# --- Sviluppo: server Vite con ricaricamento automatico --------------------------------------
FROM deps AS dev
COPY --chown=node:node frontend/ frontend/
# npm workspace: le dipendenze stanno in /app/node_modules. frontend/node_modules serve a Vite
# per la sua cache (.vite) ed è un volume in docker-compose: va creato qui con proprietario
# node, altrimenti Docker lo crea di root e Vite non può scriverci.
RUN mkdir -p /app/frontend/node_modules && chown -R node:node /app/frontend
USER node
WORKDIR /app/frontend
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:5173/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

# --- Compilazione ------------------------------------------------------------------------------
FROM deps AS build
COPY frontend/ frontend/
# Le variabili VITE_* vengono scritte nel bundle al momento della compilazione.
ARG VITE_DATA_SOURCE=demo
ARG VITE_API_BASE_URL=/api
RUN npm run build --workspace @meowrizon/frontend

# --- Produzione: file statici serviti da nginx, /api inoltrato al backend ---------------------
FROM nginx:1.30.6-alpine AS prod
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/"]
