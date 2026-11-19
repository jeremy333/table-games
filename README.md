# Table Games

Card games played across everyone's phones, with **no internet**. One phone hosts the table; the others join by scanning a QR code or opening a texted link. Phones talk directly to each other over a shared Wi‑Fi network or a phone's hotspot.

**Play it:** https://jeremy333.github.io/table-games/ *(update this link if you name the repo differently)*

## Before you go offline

Everyone opens the link once while they have internet. The page saves itself to the phone, so it opens later with no signal. Adding it to the home screen is optional.

## How to play

1. The host turns on their phone's hotspot, opens Table Games, and taps **Host a game**.
2. Under **Hotspot setup**, the host types the hotspot name and password once. The app shows a Wi‑Fi code; others scan it with their camera to join the hotspot. (Airplane Wi‑Fi usually blocks phones from seeing each other, so use a hotspot there.)
3. Each player scans the host's **join code** (or opens the texted link) and taps **Join**.
4. Their phone shows a code. The host taps **Scan a player's code** and scans it.
5. The player appears in the **Joining** box. The host taps **Let in** (or **Let everyone in**).
6. Pick a game and tap **Start**.

Texting links needs cell service. With no service at all, use the QR codes.

## Games

| Game | Players |
|------|---------|
| Rook | 4 (two teams of partners) |
| Crazy Eights | 2–7 |
| Homestead (deck-building, in the style of Dominion) | 2–4 |

Rook settings (points per hand, play-to score, minimum bid, moon value) are at the top of `games/rook.js`.

Want to add one? See [ADDING-A-GAME.md](ADDING-A-GAME.md).

## How it works

- `js/net.js` — direct phone-to-phone links (WebRTC). No server; the QR/link carries the connection details.
- `js/qr.js` — draws and scans QR codes, fully offline.
- `js/cards.js` — shared deck, shuffle, and card drawing for any game.
- `js/app.js` — screens, lobby, and passing moves between phones.
- `games/` — one file per game.
- `sw.js` — saves the app on the phone for offline use.

The host's phone holds the real game. Other phones send moves to it and receive only what they're allowed to see, so nobody can peek at other hands.

## Troubleshooting

- **Players can't connect:** make sure every phone is on the same Wi‑Fi or hotspot. Keep the host's screen on (the app tries to keep it awake).
- **Still not connecting:** on the host, tap **Scan their reply** once and allow the camera before making invites. Some browsers share a phone's network address more readily after that.
- **Someone dropped out:** they need a fresh invite. Go back to the lobby, invite them again, and start a new round.
- **Not seeing an update:** open the site while online and reload once.

## Credits

QR codes: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) and [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0), included in `vendor/`.
