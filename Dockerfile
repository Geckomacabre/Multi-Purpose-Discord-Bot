FROM oven/bun:1-debian

WORKDIR /app

# python3 + yt-dlp for YouTube audio, ffmpeg for audio and media
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    python3 \
    python3-pip \
    ffmpeg \
    && pip3 install -q --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

CMD ["bun", "run", "start:production"]
