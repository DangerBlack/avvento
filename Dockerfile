FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8477

# solo le dipendenze di produzione (qrcode, per le pagine di stampa)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js stampa.mjs ./
COPY pubblico ./pubblico

RUN addgroup -S avvento && adduser -S avvento -G avvento && chown -R avvento:avvento /app
USER avvento

EXPOSE 8477
CMD ["node", "server.js"]
