# API e worker do Origem (PI 3 · P1). A mesma imagem roda os dois:
#   api    → node src/server.js   (padrão)
#   worker → node src/worker.js   (command no compose.yaml)
FROM node:22-alpine

# O Prisma precisa do OpenSSL no Alpine.
RUN apk add --no-cache openssl

WORKDIR /app

# Dependências primeiro: a camada só é refeita quando o package-lock muda.
# --include=dev: o Prisma CLI (devDependency) gera o client no postinstall.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev

COPY . .

ENV NODE_ENV=production \
    PORT=3333
EXPOSE 3333

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3333/saude || exit 1

CMD ["node", "src/server.js"]
