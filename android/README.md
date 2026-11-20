# Table Games Host (Android app)

A small Android app that runs the game table on the host's phone, so friends on
that phone's hotspot can join from their browsers, even with no internet.
Browsers can't link phones over their own hotspot on Android; a native app can.

- `LocalServer.java` serves the web app (bundled in the app) and relays game
  messages between the host and players over the hotspot.
- `MainActivity.java` shows the web app and keeps the screen on.

GitHub builds the installable file automatically (see `.github/workflows/build-host-app.yml`)
and posts it under **Releases → Table Games Host app**. The web app files are copied in
during the build, so every update to the site also updates the app.
