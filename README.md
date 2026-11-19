# Table Games

Card games played across everyone's phones, with **no internet**. One phone hosts the table; the others join by scanning a QR code or opening a texted link. Phones talk directly to each other over a shared Wi‑Fi network or a phone's hotspot.

**Play it:** https://jeremy333.github.io/table-games/ *(update this link if you name the repo differently)*

## Before you go offline

Everyone opens the link once while they have internet. The page saves itself to the phone, so it opens later with no signal. Adding it to the home screen is optional. To be safe, also tap **Games & offline downloads → Download all games**.

## How to play

1. The host turns on their phone's hotspot, opens Table Games, and taps **Host a game**.
2. Under **Hotspot setup**, the host types the hotspot name and password once. The app shows a Wi‑Fi code; others scan it with their camera to join the hotspot.
3. Players scan the host's **game code** (or open the texted link) and tap **Join**.
4. They appear in the host's **Joining** box. The host taps **Let in** (or **Let everyone in**).
5. The host picks a game and its settings, then taps **Start**.

**Internet vs. no internet.** When the hotspot has internet, a free public service ([PeerJS](https://peerjs.com)) introduces the phones in a second, then the game runs directly between them. With no internet at all (for example, an iPhone hotspot can't run without cell service, or a plane with no Wi‑Fi), the app switches to offline joining: after a player taps Join, the host also scans the code on that player's phone.

## Games

| Game | Players |
|------|---------|
| Rook | 4 (two teams of partners) |
| Crazy Eights | 2–7 |
| Domination (deck-building; card-for-card with the classic base game, renamed) | 2–4 |

Pick a game in the lobby by searching its name, a tag (like "cards" or "partners"), or a player count (like "4"). Rook settings are chosen in the lobby: set partners or pick partner (the bidder calls a card), the Rook card's rank (high, 10½, or low), whether the last trick is worth 20, the moon's value, and the play-to score.

Want to add one? It's one game file plus one line in `games/catalog.js`. See [ADDING-A-GAME.md](ADDING-A-GAME.md).

## Offline

On the home screen, **Games & offline downloads** lets anyone search the games and download them (or **Download all**) before going somewhere with no internet. Games you open are saved automatically too. If a player's phone is missing the game the host picks, the host's phone sends it over, even offline.

## How it works

- `js/net.js` — direct phone-to-phone links (WebRTC). No server; the QR/link carries the connection details.
- `js/qr.js` — draws and scans QR codes, fully offline.
- `js/cards.js` — shared deck, shuffle, and card drawing for any game.
- `js/app.js` — screens, lobby, and passing moves between phones.
- `js/library.js` — game search, loading a game only when it's picked, and offline downloads.
- `games/catalog.js` — the list of games (one entry each).
- `games/` — one file per game, including its own styles. `template.js` is a starting point for new games.
- `sw.js` — saves the app on the phone for offline use. Games are saved separately, so adding one never touches this file.

The host's phone holds the real game. Other phones send moves to it and receive only what they're allowed to see, so nobody can peek at other hands.

## Troubleshooting

- **Players can't connect:** make sure every phone is on the same Wi‑Fi or hotspot. Keep the host's screen on (the app tries to keep it awake).
- **Still not connecting:** on the host, tap **Scan their reply** once and allow the camera before making invites. Some browsers share a phone's network address more readily after that.
- **Someone dropped out:** they need a fresh invite. Go back to the lobby, invite them again, and start a new round.
- **Not seeing an update:** open the site while online and reload once.

## Credits

Phone introductions when online: [PeerJS](https://github.com/peers/peerjs) (MIT), included in `vendor/`.
QR codes: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) and [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0), included in `vendor/`.
