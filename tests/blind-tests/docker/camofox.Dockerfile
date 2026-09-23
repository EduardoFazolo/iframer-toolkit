# jo-inc/camofox-browser from npm, in a Linux container: the way a Hermes user on a VPS gets it.
FROM node:24-trixie-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgtk-3-0 libdbus-glib-1-2 libxt6 libasound2 libx11-xcb1 libpci3 libegl1 \
    libxcomposite1 libxdamage1 libxrandr2 libxcursor1 libxi6 libxtst6 libnss3 libgbm1 \
    fonts-liberation fonts-dejavu-core fonts-noto-core fonts-noto-color-emoji ca-certificates \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN npm init -y >/dev/null && npm install @askjo/camofox-browser \
    && cd node_modules/better-sqlite3 && npm run build-release 2>/dev/null || (cd /app && npm rebuild better-sqlite3 --build-from-source)

ENV CAMOFOX_PORT=9377 CAMOFOX_CRASH_REPORT_ENABLED=false
EXPOSE 9377
CMD ["node", "node_modules/@askjo/camofox-browser/server.js"]
