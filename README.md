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
| Bird’s Nest (Rook) | 4 |
| Hearts | 4 |
| Pinochle | 4 (two teams) |
| Crazy Eights | 2–7 |
| Go Fish | 2–6 |
| Domination (deck-building) | 2–4 |
| Checkers | 2 |
| Chess | 2 |
| Mexican Train (dominoes) | 2–8 |
| Farkle (dice) | 2–8 |
| Yacht (dice) | 1–8 |
| Four in a Row | 2 |
| Mancala | 2 |
| Challenge (cards and board, teams) | 2–12 |

Pick a game in the lobby by searching its name, a tag (like "cards" or "partners"), or a player count (like "4"). Bird’s Nest settings are chosen in the lobby: set partners or pick partner (the bidder calls a card), the Bird card's rank (high, 10½, or low), whether the last trick is worth 20, the moon's value, and the play-to score.

Want to add one? It's one game file plus one line in `games/catalog.js`. See [ADDING-A-GAME.md](ADDING-A-GAME.md).

## If the host leaves

The host's phone saves the table after every move, so the game pauses instead of ending.

- **Host closes the app by accident (or on purpose with Leave, then Pause and leave):** everyone keeps their seat and sees "Game paused." Their phones reconnect on their own when the host is back.
- **Host comes back:** open Table Games and tap **Resume** on the home screen. The table keeps the same link and game code, and everyone's cards are where they were.
- **Players can leave too:** tap **Leave for now**, then later open Table Games and tap **Return to table**, or open the same game link again.
- **Ending it:** the host taps **End it** (on the home screen) or **End the table for everyone** (under Leave). Every phone is told the table is over.

## Offline

On the home screen, **Games & offline downloads** lets anyone search the games and download them (or **Download all**) before going somewhere with no internet. Games you open are saved automatically too. If a player's phone is missing the game the host picks, the host's phone sends it over, even offline.

## How it works

- `js/net.js` — phone-to-phone links (WebRTC), with the optional relay fallback.
- `js/config.js` — site settings (the relay key).
- `js/qr.js` — draws and scans QR codes, fully offline.
- `js/cards.js` — shared deck, shuffle, and card drawing for any game.
- `js/app.js` — screens, lobby, and passing moves between phones.
- `js/library.js` — game search, loading a game only when it's picked, and offline downloads.
- `games/catalog.js` — the list of games (one entry each).
- `games/` — one file per game, including its own styles. `template.js` is a starting point for new games.
- `sw.js` — saves the app on the phone for offline use. Games are saved separately, so adding one never touches this file.

The host's phone holds the real game. Other phones send moves to it and receive only what they're allowed to see, so nobody can peek at other hands.

## Hosting from your phone's hotspot with no internet (Android host app)

Android phones can't link to their own hotspot's guests from a browser, so for no-internet games the host uses a small Android app, **Table Games Host**. Friends don't install anything: they join the hotspot, scan the game code, and play in their browsers. The game even loads from the host's phone, so their phones don't need the site saved.

1. GitHub builds the app automatically after every update to this repo (Actions tab → "Build host app", about 3–5 minutes).
2. On your Android phone, open this repo's **Releases** page, open **Table Games Host app**, and tap **TableGamesHost.apk**.
3. Allow your browser to install apps when Android asks, then install. Later updates install right over the old one.
4. Open the app, turn on your hotspot (there's an **Open hotspot settings** button), and tap **Host a game**.

Keep the app open on screen while you play.

## Turning on the relay (recommended)

Many Wi‑Fi networks (home routers, mesh systems, guest networks, some hotspots) block devices from talking to each other directly. Players then see "Couldn't connect" even though they're in the same room. The relay fixes this: phones still connect directly when they can, and fall back to the relay when they can't.

1. Create a free account for **Open Relay** at https://www.metered.ca/tools/openrelay/ (20 GB a month free; card games use only a tiny amount).
2. In your Metered dashboard, find your TURN credentials URL. It looks like `https://yourapp.metered.live/api/v1/turn/credentials?apiKey=...`.
3. In this repo, open `js/config.js`, click the pencil icon, paste that URL between the quotes on the `TURN_CREDENTIALS_URL` line, and commit.

The key is visible to anyone who looks at the site's files. The worst someone could do with it is use up your free monthly allowance, and you can make a new key in the dashboard anytime.

## Troubleshooting

- **Players can't connect:** make sure every phone is on the same Wi‑Fi or hotspot, and turn on the relay (above). Keep the host's screen on (the app tries to keep it awake).
- **Still not connecting:** on the host, tap **Scan their reply** once and allow the camera before making invites. Some browsers share a phone's network address more readily after that.
- **Someone dropped out:** they need a fresh invite. Go back to the lobby, invite them again, and start a new round.
- **Not seeing an update:** open the site while online and reload once.

## Credits

Phone introductions when online: [PeerJS](https://github.com/peers/peerjs) (MIT), included in `vendor/`.
QR codes: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) and [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0), included in `vendor/`.
