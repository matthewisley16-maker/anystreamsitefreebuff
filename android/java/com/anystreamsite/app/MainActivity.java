package com.anystreamsite.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The library screen. It renders the same index.html the desktop app uses, so
 * the tiles, themes and settings stay in sync, and hands a chosen URL to
 * SiteActivity for native full-screen browsing.
 */
public class MainActivity extends Activity {
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);

        web = (WebView) findViewById(R.id.library);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        // Local assets, but the tiles load favicons over the network.
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.setBackgroundColor(0xFF000000);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Shell(), "AndroidShell");
        web.loadUrl("file:///android_asset/www/index.html");

        if (isTv()) {
            // Let the D-pad walk the tiles instead of only scrolling the page.
            web.setFocusable(true);
            web.setFocusableInTouchMode(true);
            web.requestFocus();
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            // The viewer has closed; let the library drop its "site open" state.
            web.evaluateJavascript("window.__anystreamSiteClosed && window.__anystreamSiteClosed();", null);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        try {
            CookieManager.getInstance().flush();
        } catch (Throwable ignored) {
            // Nothing to persist.
        }
    }

    private boolean isTv() {
        return getPackageManager().hasSystemFeature("android.software.leanback");
    }

    /** Exposed to the page as window.AndroidShell. */
    private class Shell {
        @JavascriptInterface
        public void openSite(final String url, final String name) {
            if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent intent = new Intent(MainActivity.this, SiteActivity.class);
                    intent.putExtra("url", url);
                    intent.putExtra("name", name == null ? "" : name);
                    startActivity(intent);
                }
            });
        }

        @JavascriptInterface
        public void clearCache() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (web != null) web.clearCache(true);
                }
            });
        }

        @JavascriptInterface
        public void clearCookies() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    CookieManager manager = CookieManager.getInstance();
                    manager.removeAllCookies(null);
                    manager.flush();
                    WebStorage.getInstance().deleteAllData();
                    if (web != null) {
                        web.clearFormData();
                        web.clearHistory();
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean isTv() {
            return MainActivity.this.isTv();
        }
    }
}
