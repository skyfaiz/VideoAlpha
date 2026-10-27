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
curl -sf http://127.0.0.1:8000/minimax-app/health && echo " minimax-app OK"

echo "== Frontend =="
cd "$APP_DIR/frontend"
npm ci --no-audit --no-fund
NODE_OPTIONS='--max-old-space-size=3072' npm run build
sudo mkdir -p /var/www/videoalpha
sudo cp -r dist/* /var/www/videoalpha/
sudo chown -R www-data:www-data /var/www/videoalpha

NGINX_CONF="$(ls /etc/nginx/sites-enabled/* | head -n 1)"
if [ -n "$NGINX_CONF" ] && ! grep -q "location /minimax-app/" "$NGINX_CONF"; then
  sudo python3 - "$NGINX_CONF" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
txt = p.read_text()
block = """    location = /minimax-app {
        return 301 /minimax-app/;
    }

    location /minimax-app/ {
        proxy_pass http://127.0.0.1:8000/minimax-app/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }

"""
if "location / {" in txt and "location /minimax-app/" not in txt:
    txt = txt.replace("    location / {", block + "    location / {", 1)
    p.write_text(txt)
PY
fi
sudo nginx -t
sudo systemctl reload nginx

echo "== Done =="
