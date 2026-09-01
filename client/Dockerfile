FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Se hornean en el bundle estático en tiempo de build. VITE_API_URL va VACÍO a
# propósito para que la app llame same-origin /api/*, que nginx proxea al
# servicio server — sin CORS y sin hardcodear host/puerto del backend. Por eso
# api.js usa ?? y no ||: "" es falsy.
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_URL=""
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80 || exit 1
