FROM oven/bun:1-debian

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    libvips-dev \
    libfontconfig1-dev \
    libzxing-dev \
    cmake \
    build-essential \
    python3 \
    python3-pip \
    pkg-config \
    ffmpeg \
    && pip3 install -q --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# pHash (https://phash.org), the perceptual hash library behind scam image matching
# (src/utils/phash.ts). Debian doesn't package it, so build it from a pinned commit.
ARG PHASH_COMMIT=e5bdad184f88c6d0e43f188c634b5e2e10ab7779
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates libpng-dev libjpeg-dev libtiff-dev \
    && git clone https://github.com/aetilius/pHash.git /tmp/phash \
    && git -C /tmp/phash checkout "$PHASH_COMMIT" \
    && cmake -S /tmp/phash -B /tmp/phash/build -DCMAKE_BUILD_TYPE=Release \
       -DPHASH_DYNAMIC=ON -DWITH_AUDIO_HASH=OFF -DWITH_VIDEO_HASH=OFF -Wno-dev \
    && cmake --build /tmp/phash/build -j"$(nproc)" \
    && cmake --install /tmp/phash/build \
    && ldconfig \
    && rm -rf /tmp/phash /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build:native

CMD ["bun", "run", "start:production"]
