FROM oven/bun:1-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

COPY . .

CMD ["bun", "run", "start:production"]