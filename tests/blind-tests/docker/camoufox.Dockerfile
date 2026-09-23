# camoufox inside a Linux container, the way it would run on a VPS.
# Two modes are driven from the same image: headless=True and headless="virtual" (Xvfb).
FROM python:3.13-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb libgtk-3-0 libdbus-glib-1-2 libxt6 libasound2 libx11-xcb1 libpci3 libegl1 \
    libxcomposite1 libxdamage1 libxrandr2 libxcursor1 libxi6 libxtst6 libnss3 libgbm1 \
    fonts-liberation fonts-dejavu-core fonts-noto-core fonts-noto-color-emoji ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "camoufox[geoip]" playwright \
    && python -m camoufox fetch

WORKDIR /bench
COPY camoufox_worker.py targets.py probe.py /bench/
CMD ["sleep", "infinity"]
