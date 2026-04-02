FROM mcr.microsoft.com/playwright:v1.43.0-jammy

WORKDIR /app

# Install system packages (bun + display/VNC stack + fonts)
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    unzip wget gnupg xvfb x11vnc novnc websockify \
    fonts-liberation fonts-dejavu-core fonts-freefont-ttf \
    fonts-ubuntu fonts-noto fonts-noto-color-emoji \
    fonts-open-sans fonts-roboto \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome stable (amd64 only — arm64 falls back to playwright chromium)
RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
      wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-chrome.gpg \
      && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
      && apt-get update && apt-get install -y google-chrome-stable \
      && rm -rf /var/lib/apt/lists/* \
      && ln -sf /usr/bin/google-chrome-stable /usr/bin/chrome; \
    else \
      echo "arm64: skipping Chrome, will use playwright chromium at runtime"; \
    fi

# Download uBlock Origin (unpacked extension from GitHub releases)
RUN mkdir -p /extensions \
    && wget -q "https://github.com/gorhill/uBlock/releases/download/1.61.2/uBlock0_1.61.2.chromium.zip" -O /tmp/ublock.zip \
    && unzip -q /tmp/ublock.zip -d /extensions \
    && rm /tmp/ublock.zip
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install dependencies first (layer cache)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Install all browsers + OS-level deps so the API can fall back between them
RUN npx playwright install --with-deps
RUN npx patchright install chromium

# Copy application code
COPY . .

ENV NODE_ENV=production

# Railway injects PORT at runtime; default to 3021 for local use
EXPOSE 3021

# Healthcheck for Railway / Docker Compose
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3021) + '/health').then(r => { if (!r.ok) process.exit(1) })"

CMD ["bun", "run", "index.ts"]
