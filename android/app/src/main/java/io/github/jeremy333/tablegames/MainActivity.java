package io.github.jeremy333.tablegames;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

/**
 * Table Games Host: runs the game table on this phone so friends on its
 * hotspot can join from their browsers, with or without internet.
 */
public class MainActivity extends Activity {
    private LocalServer server;
    private WebView web;
    private Updater updater;
    private volatile int latestNative = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        updater = new Updater(BuildConfig.REPO, getFilesDir());
        server = startServer();
        checkForUpdates();

        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setWebChromeClient(new WebChromeClient()); // shows confirm/prompt dialogs
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("127.0.0.1".equals(url.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url)); // other links open in the browser
                } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "TGHost");
        setContentView(web);

        if (server == null) {
            web.loadData("<h2 style='font-family:sans-serif'>Couldn't start the table</h2>"
                + "<p style='font-family:sans-serif'>Close the app completely and open it again.</p>", "text/html", "utf-8");
            return;
        }
        web.loadUrl("http://127.0.0.1:" + server.getPort() + "/");
    }

    private LocalServer startServer() {
        for (int port = 8737; port < 8747; port++) {
            // Serve the newest downloaded site if there is one, otherwise the copy built into the app.
            LocalServer s = new LocalServer(path -> {
                File live = new File(updater.liveDir(), path);
                if (live.isFile()) return new FileInputStream(live);
                return getAssets().open("www/" + path);
            }, port);
            try {
                s.start();
                return s;
            } catch (IOException e) {
                s.stop();
            }
        }
        return null;
    }

    /** In the background: fetch the latest games and site, and see if a newer app exists. */
    private void checkForUpdates() {
        new Thread(() -> {
            boolean changed = updater.updateSite();
            latestNative = updater.latestNativeVersion();
            if (changed && web != null) {
                runOnUiThread(() -> web.evaluateJavascript("window.tgAppUpdated && window.tgAppUpdated()", null));
            }
        }).start();
    }

    /** Small helpers the web page can call. */
    public class Bridge {
        /** Where the website lives, for online games (players join there, not on this phone). */
        @JavascriptInterface
        public String siteUrl() {
            String[] parts = BuildConfig.REPO.split("/");
            return "https://" + parts[0] + ".github.io/" + parts[1] + "/";
        }

        /** {"version":n,"latest":n,"url":"..."} so the page can offer an app update. */
        @JavascriptInterface
        public String updateInfo() {
            return "{\"version\":" + BuildConfig.NATIVE_VERSION + ",\"latest\":" + latestNative
                + ",\"url\":\"" + updater.apkUrl() + "\"}";
        }

        @JavascriptInterface
        public void openUpdate() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(updater.apkUrl())));
                } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void openHotspotSettings() {
            runOnUiThread(() -> {
                Intent tether = new Intent(Intent.ACTION_MAIN);
                tether.setClassName("com.android.settings", "com.android.settings.TetherSettings");
                try {
                    startActivity(tether);
                } catch (Exception e) {
                    try {
                        startActivity(new Intent(Settings.ACTION_WIRELESS_SETTINGS));
                    } catch (Exception ignored) { }
                }
            });
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (updater != null) checkForUpdates(); // back in the app: pick up anything new
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
