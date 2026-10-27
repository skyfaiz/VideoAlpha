#!/usr/bin/env bash
# VideoAlpha deploy script — run on the EC2 host from ~/app
# Pulls latest code, reinstalls deps if needed, rebuilds frontend, restarts backend.
set -e

cd "$(dirname "$0")"
APP_DIR="$(pwd)"

echo "== Pulling latest code =="
git pull --ff-only

echo "== Backend =="
cd "$APP_DIR/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
sudo systemctl restart videoalpha-backend
sleep 2
curl -sf http://127.0.0.1:8000/health && echo " backend OK"

echo "== Frontend =="
cd "$APP_DIR/frontend"
npm ci --no-audit --no-fund
NODE_OPTIONS='--max-old-space-size=3072' npm run build
sudo mkdir -p /var/www/videoalpha
sudo cp -r dist/* /var/www/videoalpha/
sudo chown -R www-data:www-data /var/www/videoalpha
sudo systemctl reload nginx

echo "== Done =="
