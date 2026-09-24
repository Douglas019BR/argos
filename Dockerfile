FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

COPY config ./config

ENV NODE_ENV=production \
    DATA_DIR=/data \
    CONFIG_DIR=/app/config

VOLUME ["/data"]

CMD ["node", "dist/index.js"]
