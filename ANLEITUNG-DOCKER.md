# Sternfresser mit Docker installieren

Diese Anleitung bringt Sternfresser mit Docker auf deinen Server, sodass es unter **https://zehnkronen.com/Sternfresser** läuft.
Der Container enthält die Webseite und den Spielserver. Eine Datenbank ist nicht nötig.

Für Coolify gibt es die eigene Anleitung in `ANLEITUNG-SERVER.md`.

---

## 1. Voraussetzungen

- Linux-Server mit **Docker** und **Docker Compose** (prüfen mit `docker --version` und `docker compose version`)
- Zugang per SSH
- Ein Reverse-Proxy für zehnkronen.com (nginx, Traefik oder Caddy), der HTTPS macht

---

## 2. Dateien auf den Server kopieren

Auf deinem Computer, im Ordner mit der ZIP:

```bash
scp sternfresser-docker.zip benutzer@zehnkronen.com:~
```

Auf dem Server:

```bash
ssh benutzer@zehnkronen.com
unzip sternfresser-docker.zip
cd sternfresser
```

---

## 3. Container bauen und starten

```bash
docker compose up -d --build
```

Beim ersten Mal dauert das 1–3 Minuten. Docker lädt Node.js, lässt die Spieltests laufen, baut das Spiel und startet den Server.

Prüfen, ob er läuft:

```bash
docker compose ps                 # Status sollte "healthy" werden
docker compose logs -f            # Live-Protokoll, Beenden mit Strg+C
curl http://127.0.0.1:3000/Sternfresser/health
```

Die letzte Zeile muss etwas wie `{"sternfresser":true,"version":4,"rooms":0,...}` ausgeben.

---

## 4. Über zehnkronen.com/Sternfresser erreichbar machen

Der Container lauscht nur lokal auf Port 3000 (`127.0.0.1:3000`). Dein Reverse-Proxy leitet `/Sternfresser` dorthin weiter. **WebSockets müssen durchgelassen werden**, sonst gehen Räume und Mehrspieler nicht.

### nginx

In die Konfiguration von zehnkronen.com (im `server { ... }`-Block mit `listen 443`) einfügen:

```nginx
location /Sternfresser/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
}
location = /Sternfresser { return 301 /Sternfresser/; }
```

Dann:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Caddy

Im Block von `zehnkronen.com` im Caddyfile:

```
handle /Sternfresser* {
    reverse_proxy 127.0.0.1:3000
}
```

Dann `sudo systemctl reload caddy`. WebSockets leitet Caddy automatisch weiter.

### Traefik (läuft selbst in Docker)

In `docker-compose.yml` die Zeilen `ports:` und `- "127.0.0.1:3000:3000"` entfernen und stattdessen Labels ergänzen. Den Netzwerknamen an deinen Traefik anpassen:

```yaml
    labels:
      - traefik.enable=true
      - traefik.http.routers.sternfresser.rule=Host(`zehnkronen.com`) && PathPrefix(`/Sternfresser`)
      - traefik.http.routers.sternfresser.entrypoints=websecure
      - traefik.http.routers.sternfresser.tls.certresolver=letsencrypt
      - traefik.http.services.sternfresser.loadbalancer.server.port=3000
    networks:
      - traefik
networks:
  traefik:
    external: true
```

Danach `docker compose up -d`.

---

## 5. Fertig – testen

1. **https://zehnkronen.com/Sternfresser/health** öffnen. Es muss `"sternfresser":true` erscheinen.
2. **https://zehnkronen.com/Sternfresser** öffnen, auf **Spiel hosten** tippen und einen Raum erstellen.
3. Auf einem zweiten Handy **Beitreten** tippen und den Code eingeben.

Achte auf das **große S** in `/Sternfresser`. Pfade unterscheiden Groß- und Kleinschreibung.

---

## Alltag

| Aufgabe | Befehl (im Ordner `sternfresser`) |
| --- | --- |
| Status ansehen | `docker compose ps` |
| Protokoll ansehen | `docker compose logs -f` |
| Neu starten | `docker compose restart` |
| Stoppen | `docker compose down` |
| Update einspielen | neue Dateien hineinkopieren, dann `docker compose up -d --build` |
| Alte Images aufräumen | `docker image prune -f` |

Der Container startet nach einem Server-Neustart von selbst wieder (`restart: unless-stopped`).
Ein Neustart beendet nur die laufenden Partien, sonst geht nichts verloren. Level und Skins der Spieler liegen auf ihren Handys.

---

## Einstellungen

In `docker-compose.yml` unter `environment:`. Nach einer Änderung `docker compose up -d` ausführen.

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `BASE_PATH` | `/Sternfresser` | Pfad des Spiels. Für eine eigene Subdomain (z. B. sternfresser.zehnkronen.com) auf `/` setzen. |
| `MAX_ROOMS` | `40` | Höchstzahl gleichzeitiger Räume (je bis 12 Menschen und 28 Bots) |
| `PORT` | `3000` | Port im Container. Nur ändern, wenn du auch die Port-Zeile anpasst. |

Ein voller Raum braucht grob 2–5 % eines CPU-Kerns und 30–60 MB Arbeitsspeicher.

---

## Ohne Bauen auf dem Server (optional)

Der Ordner `dist/` in der ZIP enthält das fertig gebaute Spiel. Wenn auf dem Server kein Internet für `npm` verfügbar ist, geht es auch ohne Docker-Build, direkt mit Node.js 20 oder neuer:

```bash
npm ci --omit=dev
PORT=3000 BASE_PATH=/Sternfresser node server/index.mjs
```

---

## Wenn etwas nicht klappt

| Problem | Lösung |
| --- | --- |
| `docker compose up` bricht beim Bauen ab | `docker compose logs` bzw. die Ausgabe ansehen. Meist fehlt Internet für den Download von Node.js oder npm-Paketen. |
| `/Sternfresser/health` zeigt 404 oder das WarGame | Proxy-Regel fehlt oder ist falsch geschrieben (großes S). Mit `curl http://127.0.0.1:3000/Sternfresser/health` direkt auf dem Server prüfen. |
| Seite lädt, aber „Spielserver nicht erreichbar“ | WebSockets werden blockiert. Bei nginx die Zeilen `Upgrade` und `Connection "upgrade"` prüfen. |
| Seite ohne Design | Adresse mit Schrägstrich am Ende aufrufen: `https://zehnkronen.com/Sternfresser/` |
| Port 3000 ist schon belegt | In `docker-compose.yml` `"127.0.0.1:3000:3000"` zu z. B. `"127.0.0.1:3010:3000"` ändern und im Proxy `3010` eintragen. |
| „Der Host nutzt eine andere Spielversion“ | Seite auf dem Handy neu laden bzw. die App einmal schließen und neu öffnen. |
