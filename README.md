# Sternfresser

Ein Blob-Fress-Spiel im Weltall fürs Handy, angelehnt an das Spielprinzip von Nebulous.io und Agar.io. Mehrspieler bis 12 Menschen: Einer hostet, die anderen treten per Raumcode bei, auch mitten in der laufenden Partie.

**Spielen:** https://zehnkronen.com/Sternfresser (eigener Spielserver) · https://mhfsim.github.io/Nebolous/ (GitHub Pages, Mehrspieler über PeerJS)

**Auf den eigenen Server bringen:** mit Docker siehe [ANLEITUNG-DOCKER.md](ANLEITUNG-DOCKER.md), mit Coolify siehe [ANLEITUNG-SERVER.md](ANLEITUNG-SERVER.md).

Jeder Push auf `main` baut das Spiel, lässt die Tests laufen und stellt es auf GitHub Pages (`.github/workflows/pages.yml`). Einmalig nötig: unter *Settings → Pages → Build and deployment → Source* „GitHub Actions“ wählen.

## Was drin ist

- Wachsen durch Sternenstaub und kleinere Spieler, Teilen, Masse auswerfen, Wiederverschmelzen
- Schwarze Löcher: Kleine verstecken sich darin, Große zerplatzen, Auswurf schiebt sie weg
- 5 Modi: Jeder gegen jeden, Teams (2–4), Battle Royale mit schrumpfender Zone, Flaggenjagd, Fußball
- Wurmlöcher, die kleine Blobs quer über die Karte schicken
- Zeitrunden, Chaos-Modus, 3 Kartengrößen, bis zu 28 Bots in 3 Stärken
- 10 Gegenstände: Turbo, Schild, Fusion, Sog, Frost, Wachstum, Tarnung, Supernova, Sprung, Doppelstaub
- 44 gezeichnete Skins mit frei wählbarer Farbe, Level, XP, 28 Erfolge, Tagesaufgaben, Statistik
- Bestenliste, Minimap, Kill-Meldungen, Emotes, Ton, Touch- und Maus/Tastatur-Steuerung

## Entwickeln

```
npm install
npm test          # Logiktests (node --test)
npm run build     # erzeugt dist/index.html (eine einzige Datei)
```

Läuft das Spiel über `server/index.mjs` (Docker), erkennt es den Server automatisch und spielt die Partien dort (WebSocket, Räume mit Code, Wiederverbinden, Raumchef-Wechsel). Ohne Server (GitHub Pages) nutzt der Mehrspieler den kostenlosen PeerJS-Server (WebRTC). Die Seite braucht dafür HTTPS. Zum lokalen Testen: `node test/peerserver.cjs` starten und das Spiel mit `?signal=127.0.0.1:9000` öffnen. `test/e2e_multiplayer.py` spielt mit Playwright einen Host und einen Gast durch.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `src/sim.js`, `src/bots.js` | Spiellogik und Computergegner, läuft beim Host |
| `src/proto.js`, `src/net.js` | Binär-Snapshots mit Sichtbereich, Sitzungen für Server, Host und Gast |
| `server/index.mjs`, `Dockerfile` | Spielserver: Räume, liefert auch die Webseite aus |
| `src/world.js`, `src/render.js`, `src/skins.js` | Anzeige: weiche Bewegung, Kamera, Canvas-Grafik |
| `src/input.js`, `src/audio.js`, `src/store.js` | Steuerung, Ton, Profil |
| `src/main.js`, `src/index.html`, `src/style.css` | Menüs, HUD, Verdrahtung |

## Bekannte Grenzen

- Nur auf GitHub Pages: Dort läuft die Partie auf dem Gerät des Hosts. Schließt er die Seite, endet sie für alle. Mit dem eigenen Server gilt das nicht.
- Getestet mit 2 Spielern in Headless-Chrome. Viele echte Handys gleichzeitig sind nicht getestet.
- Fortschritt (Level, Skins, Erfolge) liegt nur im Browser des jeweiligen Geräts.
