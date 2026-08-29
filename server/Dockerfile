# Build em uma imagem, runtime em outra — a imagem final não carrega o
# TypeScript nem as devDependencies, só o necessário para rodar.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# A Oracle Ampere é ARM64; node:22-slim tem as duas arquiteturas, então a
# mesma imagem sobe tanto no seu PC (x64) quanto na VPS (ARM).
EXPOSE 8080
# Encerramento limpo depende do processo receber SIGTERM diretamente — sem isso
# o Node fica como PID 1 sem handlers de sinal padrão. O "exec" do node cuida.
CMD ["node", "dist/index.js"]
