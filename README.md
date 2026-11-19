# Table Games

Card games played across everyone's phones, with **no internet**. One phone hosts the table; the others join by scanning a QR code or opening a texted link. Phones talk directly to each other over a shared Wi‑Fi network or a phone's hotspot.

**Play it:** https://jeremy333.github.io/table-games/ *(update this link if you name the repo differently)*

## Before you go offline

Everyone opens the link once while they have internet. The page saves itself to the phone, so it opens later with no signal. Adding it to the home screen is optional.

## How to play

1. Get everyone on the same Wi‑Fi, or have one phone turn on its hotspot and everyone else join it. (Airplane Wi‑Fi usually blocks phones from seeing each other, so use a hotspot there.)
2. The host taps **Host a game**, then **Invite a player**.
3. The player scans the host's QR code with their camera (or opens the texted link) and taps **Join**.
4. Their phone shows a reply code. The host taps **Scan their reply** and scans it (or opens the reply link the player texted back).
5. Repeat for each player, then tap **Start**.

Texting links needs cell service. With no service at all, use the QR codes.

## Games

| Game | Players |
|------|---------|
| Crazy Eights | 2–7 |

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
