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

import java.io.IOException;

/**
 * Table Games Host: runs the game table on this phone so friends on its
 * hotspot can join from their browsers, with or without internet.
 */
public class MainActivity extends Activity {
    private LocalServer server;
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        server = startServer();

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
            LocalServer s = new LocalServer(path -> getAssets().open("www/" + path), port);
            try {
                s.start();
                return s;
            } catch (IOException e) {
                s.stop();
            }
        }
        return null;
    }

    /** Small helpers the web page can call. */
    public class Bridge {
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
