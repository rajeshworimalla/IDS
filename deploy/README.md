# Production setup steps (TLS, nginx, logging, service)

1) TLS reverse proxy (nginx)
- File: deploy/nginx-https.conf
- Do:
  sudo cp deploy/nginx-https.conf /etc/nginx/sites-available/ids.conf
  sudo ln -s /etc/nginx/sites-available/ids.conf /etc/nginx/sites-enabled/ids.conf
  sudo mkdir -p /etc/nginx
  sudo cp deploy/ids.deny /etc/nginx/ids.deny
  # Provide certs (choose one)
  # a) Let’s Encrypt (recommended):
  #    sudo certbot --nginx -d your.domain
  # b) Self-signed (dev):
  #    sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  #      -keyout /etc/ssl/private/ids.privkey.pem \
  #      -out /etc/ssl/certs/ids.fullchain.pem
  sudo nginx -t && sudo systemctl reload nginx

2) JSON access logs for collection
- Already configured in nginx-https.conf (access_log /var/log/nginx/ids.access.json ids_json;)
- Ship with your preferred agent (Filebeat/Vector/Fluent Bit). Example Vector sink is not included here.

3) Backend service (systemd)
- Files: deploy/systemd/backend.service, deploy/systemd/backend.env.example
- Do:
  sudo useradd -r -s /usr/sbin/nologin -m -d /var/lib/ids ids || true
  sudo groupadd -f ids
  sudo usermod -aG ids ids
  sudo install -D -m 644 deploy/systemd/backend.service /etc/systemd/system/ids-backend.service
  sudo install -D -m 644 deploy/systemd/backend.env.example /etc/ids/backend.env
  sudo sed -i 's|WorkingDirectory=.*|WorkingDirectory=$(pwd)/backend|' /etc/systemd/system/ids-backend.service
  # Allow write to nginx deny file managed by app
  sudo touch /etc/nginx/ids.deny && sudo chown root:ids /etc/nginx/ids.deny && sudo chmod 664 /etc/nginx/ids.deny
  # Sudoers for controlled actions
  sudo visudo -f /etc/sudoers.d/ids-firewall < deploy/sudoers.d/ids-firewall
  sudo systemctl daemon-reload
  sudo systemctl enable --now ids-backend.service

4) App config
- Edit /etc/ids/backend.env to set JWT_SECRET, MONGODB_URI, REDIS_URL, USE_FIREWALL/USE_NGINX_DENY, NGINX_RELOAD_CMD.
- Alternatively use the Blocker -> Policies UI to toggle enforcement.

5) Verify flow
- Hit https://<host>/ -> proxied to backend.
- Trigger rate-limits; check /var/log/nginx/ids.access.json.
- When threshold is hit, verify firewall/ipset rules and nginx deny gets updated; access should be blocked at proxy/OS.
