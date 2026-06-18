FROM node:24-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @workspace/api-server run build

RUN mkdir -p /data

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production
ENV DB_PATH=/data/deals.sqlite

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
