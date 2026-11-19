# Sternfresser auf zehnkronen.com/Sternfresser

Der Container enthält beides: die Webseite des Spiels und den Spielserver. Die Partien laufen auf dem Server. Der Ersteller eines Raums darf gehen, der Raum bleibt offen, und wer kurz die Verbindung verliert (z. B. App im Hintergrund), steigt automatisch wieder ein.

- Port im Container: **3000**
- Adresse: **https://zehnkronen.com/Sternfresser** (großes S, Pfade sind case-sensitiv)
- Es gibt keine Datenbank und keine Daten zu sichern. Ein Neustart beendet nur die laufenden Partien.

---

## Weg A: Coolify (empfohlen)

1. In Coolify das Projekt von Zehn Kronen öffnen → **+ Neu** → **Public Repository**.
   Adresse: `https://github.com/MHFSim/Nebolous`, Branch `main`.
   (Ist das Repo privat, stattdessen „Private Repository (with GitHub App)“ wählen.)
2. **Build Pack:** `Dockerfile`.
3. **Ports Exposes:** `3000`.
4. **Domains:** `https://zehnkronen.com/Sternfresser` eintragen.
   Coolify leitet dann nur diesen Pfad an Sternfresser weiter, das WarGame auf `zehnkronen.com/` bleibt unberührt.
   Die Einstellung **„Strip Prefixes“** ist egal: Der Server funktioniert mit und ohne entferntes `/Sternfresser`.
5. **Health Check** (unter *Advanced* bzw. *Health Checks*), falls nicht automatisch erkannt: Pfad `/health`, Port `3000`.
6. **Deploy** klicken. Der Build lässt vorher die Spieltests laufen und dauert 1–2 Minuten.
7. Prüfen: **https://zehnkronen.com/Sternfresser/health** muss etwas wie
   `{"sternfresser":true,"version":4,"rooms":0,...}` zeigen. Dann **https://zehnkronen.com/Sternfresser** öffnen.

**Updates:** Nach jedem Push auf GitHub in Coolify **Redeploy** drücken. Oder unter *Webhooks* „Auto Deploy“ einschalten, dann geht es von selbst.

> Wichtig: Läuft der Sternfresser-Container nicht (z. B. während eines fehlgeschlagenen Builds), leitet Coolify `/Sternfresser` an die Haupt-App auf `zehnkronen.com/` weiter. Siehst du statt des Spiels das WarGame, ist der Container nicht gesund – Logs in Coolify ansehen.

---

## Weg B: Docker ohne Coolify (aus der ZIP)

Auf dem Server:

```bash
unzip sternfresser-server.zip -d sternfresser && cd sternfresser
docker compose up -d --build
```

Dann im Reverse-Proxy den Pfad weiterleiten. WebSockets müssen durchgelassen werden.

**nginx** (im `server { ... }` von zehnkronen.com):

```nginx
location /Sternfresser/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
}
location = /Sternfresser { return 301 /Sternfresser/; }
```

Dafür in `docker-compose.yml` die Zeilen `ports:` und `- "3000:3000"` einkommentieren (am besten als `"127.0.0.1:3000:3000"`).

**Traefik** (Labels in `docker-compose.yml` ergänzen):

```yaml
    labels:
      - traefik.enable=true
      - traefik.http.routers.sternfresser.rule=Host(`zehnkronen.com`) && PathPrefix(`/Sternfresser`)
      - traefik.http.routers.sternfresser.entrypoints=https
      - traefik.http.routers.sternfresser.tls.certresolver=letsencrypt
      - traefik.http.services.sternfresser.loadbalancer.server.port=3000
```

---

## Einstellungen (Umgebungsvariablen)

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `3000` | Port im Container |
| `BASE_PATH` | `/Sternfresser` | Pfad, unter dem das Spiel liegt. Für eine eigene Subdomain auf `/` setzen. |
| `MAX_ROOMS` | `40` | Höchstzahl gleichzeitiger Räume (je bis 12 Menschen + Bots) |

Ein Raum mit 12 Spielern und 28 Bots braucht grob 2–5 % eines CPU-Kerns und 30–60 MB Arbeitsspeicher. Leere Räume schließen sich nach 90 Sekunden.

---

## Wenn etwas nicht klappt

| Problem | Ursache und Lösung |
| --- | --- |
| `/Sternfresser/health` zeigt das WarGame oder 404 | Container läuft nicht oder Domain-Pfad falsch. Logs in Coolify ansehen; Groß-/Kleinschreibung prüfen. |
| Seite lädt, aber „Raum erstellen“ meldet „Spielserver nicht erreichbar“ | WebSockets werden blockiert. In Coolify geht das von selbst; bei nginx die `Upgrade`-Zeilen prüfen. |
| Seite ohne Design oder Bilder | Adresse ohne Schrägstrich am Ende aufgerufen und Weiterleitung fehlt. Das Spiel korrigiert das selbst; sonst `https://zehnkronen.com/Sternfresser/` verwenden. |
| „Der Host nutzt eine andere Spielversion“ | Handy hat noch die alte Version: Seite neu laden bzw. App einmal schließen und öffnen. |

Lokal testen ohne Docker: `npm install`, dann `npm run serve` und http://localhost:3000/Sternfresser öffnen.
