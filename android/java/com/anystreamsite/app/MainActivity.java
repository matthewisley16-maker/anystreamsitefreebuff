package com.anystreamsite.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
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
    private boolean tv;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);

        web = (WebView) findViewById(R.id.library);
        tv = isTv();
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

        String key;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP: key = "up"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: key = "down"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: key = "left"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: key = "right"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_BUTTON_A: key = "select"; break;
            default: return super.dispatchKeyEvent(event);
        }

        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            if (!"select".equals(key) || event.getRepeatCount() == 0) sendTvKey(key);
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
            if (tv) web.requestFocus();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && tv && web != null) web.requestFocus();
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
        public void showKeyboard() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (web == null) return;
                    web.requestFocus();
                    InputMethodManager input = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                    if (input != null) input.showSoftInput(web, InputMethodManager.SHOW_IMPLICIT);
                }
            });
        }

        @JavascriptInterface
        public boolean isTv() {
            return MainActivity.this.isTv();
        }
    }
}
