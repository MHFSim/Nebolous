# Sternfresser

Ein Blob-Fress-Spiel im Weltall fürs Handy, angelehnt an das Spielprinzip von Nebulous.io und Agar.io. Mehrspieler bis 12 Menschen: Einer hostet, die anderen treten per Raumcode bei, auch mitten in der laufenden Partie.

**Spielen:** https://mhfsim.github.io/Nebolous/

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

Mehrspieler nutzt standardmäßig den kostenlosen PeerJS-Server (WebRTC). Die Seite braucht dafür HTTPS. Zum lokalen Testen: `node test/peerserver.cjs` starten und das Spiel mit `?signal=127.0.0.1:9000` öffnen. `test/e2e_multiplayer.py` spielt mit Playwright einen Host und einen Gast durch.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `src/sim.js`, `src/bots.js` | Spiellogik und Computergegner, läuft beim Host |
| `src/proto.js`, `src/net.js` | Binär-Snapshots mit Sichtbereich, Host- und Client-Sitzung |
| `src/world.js`, `src/render.js`, `src/skins.js` | Anzeige: weiche Bewegung, Kamera, Canvas-Grafik |
| `src/input.js`, `src/audio.js`, `src/store.js` | Steuerung, Ton, Profil |
| `src/main.js`, `src/index.html`, `src/style.css` | Menüs, HUD, Verdrahtung |

## Bekannte Grenzen

- Das Spiel läuft auf dem Gerät des Hosts. Schließt er die Seite oder wechselt am Handy die App, endet oder pausiert die Partie für alle. Host-Wechsel ist nicht eingebaut.
- Getestet mit 2 Spielern in Headless-Chrome. Viele echte Handys gleichzeitig sind nicht getestet.
- Fortschritt (Level, Skins, Erfolge) liegt nur im Browser des jeweiligen Geräts.
