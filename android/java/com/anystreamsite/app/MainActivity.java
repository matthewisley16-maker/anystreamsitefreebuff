package com.anystreamsite.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;

/**
 * The library screen. It renders the same index.html the desktop app uses, so
 * the tiles, themes and settings stay in sync, and hands a chosen URL to
 * SiteActivity for native full-screen browsing.
 */
public class MainActivity extends Activity {
    private WebView web;
    private boolean tv;
    private final Handler keyHandler = new Handler(Looper.getMainLooper());
    private boolean selectDown;
    private boolean selectLongFired;
    private final Runnable longSelect = new Runnable() {
        @Override
        public void run() {
            if (!selectDown || web == null) return;
            selectLongFired = true;
            web.evaluateJavascript(
                    "window.__anystreamTvLongSelect && window.__anystreamTvLongSelect()", null);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);

        web = (WebView) findViewById(R.id.library);
        tv = Tv.isTv(this);
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
        // A TV remote scrolls by moving focus, so the page itself never shows
        // scrollbars or a stretching overscroll glow.
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setBackgroundColor(0xFF000000);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (!tv) return;
                // The page uses its own focus highlights; the native shell owns
                // the remote so WebView cannot consume arrows for scrolling.
                view.requestFocus();
                view.evaluateJavascript(
                        "window.__anystreamNativeKeys = true;" +
                        "if (window.__anystreamTvFocus) window.__anystreamTvFocus();", null);
            }
        });
        web.addJavascriptInterface(new Shell(), "AndroidShell");
        web.loadUrl("file:///android_asset/www/index.html");

        if (tv) {
            // Let the D-pad walk the tiles instead of only scrolling the page.
            web.setFocusable(true);
            web.setFocusableInTouchMode(true);
            web.requestFocus();
        }
    }

    /**
     * Android TV WebView swallows D-pad keys before JavaScript sees them, and
     * an Enter press only activates real buttons (the tiles are articles with
     * role=button). Send every directional/select key straight to the page's
     * TV focus controller, then consume it so WebView cannot steal focus or
     * scroll the library out from under the highlight.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (!tv) return super.dispatchKeyEvent(event);

        String key = Tv.keyFor(event.getKeyCode());
        if (key == null) return super.dispatchKeyEvent(event);

        if ("select".equals(key)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (event.getRepeatCount() == 0) {
                    selectDown = true;
                    selectLongFired = false;
                    keyHandler.removeCallbacks(longSelect);
                    keyHandler.postDelayed(longSelect, 650);
                }
                return true;
            }
            if (event.getAction() == KeyEvent.ACTION_UP) {
                keyHandler.removeCallbacks(longSelect);
                boolean shortPress = selectDown && !selectLongFired;
                selectDown = false;
                if (shortPress) sendTvKey("select");
                return true;
            }
            return true;
        }

        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            // A direction press interrupts a pending long-select gesture.
            keyHandler.removeCallbacks(longSelect);
            selectDown = false;
            sendTvKey(key);
        }
        return true;
    }

    private void sendTvKey(String key) {
        if (web == null) return;
        web.evaluateJavascript(
                "window.__anystreamTvKey && window.__anystreamTvKey('" + key + "')", null);
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        // Settings and the add/edit dialogs are DOM overlays, not WebView
        // history entries. Let the page consume Back first, otherwise Android
        // would close the whole app from inside Settings.
        web.evaluateJavascript(
                "window.__anystreamBack ? window.__anystreamBack() : false",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String handled) {
                        if ("true".equals(handled)) return;
                        if (web != null && web.canGoBack()) web.goBack();
                        else moveTaskToBack(true);
                    }
                });
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
        keyHandler.removeCallbacks(longSelect);
        selectDown = false;
        selectLongFired = false;
        try {
            CookieManager.getInstance().flush();
        } catch (Throwable ignored) {
            // Nothing to persist.
        }
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
        public void showKeyboard() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (web == null) return;
                    InputMethodManager input = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                    if (input != null) {
                        // Focus belongs to the HTML input, not the WebView view.
                        // Calling requestFocus here can blur the input and make
                        // Android dismiss the keyboard immediately after it opens.
                        web.post(new Runnable() {
                            @Override public void run() {
                                if (web != null) input.showSoftInput(web, InputMethodManager.SHOW_FORCED);
                            }
                        });
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean isTv() {
            return Tv.isTv(MainActivity.this);
        }

        @JavascriptInterface
        public String getSiteNavigationMode() {
            return getSharedPreferences("anystreamsite", MODE_PRIVATE)
                    .getString("site_nav_mode", "dpad");
        }

        @JavascriptInterface
        public void setSiteNavigationMode(String mode) {
            if (!"dpad".equals(mode) && !"pointer".equals(mode)) return;
            getSharedPreferences("anystreamsite", MODE_PRIVATE)
                    .edit().putString("site_nav_mode", mode).apply();
        }
    }
}
