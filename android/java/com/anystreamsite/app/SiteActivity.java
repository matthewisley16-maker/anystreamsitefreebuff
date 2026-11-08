package com.anystreamsite.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.TextView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * One streaming site in its own WebView, with the same back / forward / reload /
 * exit controls the desktop app shows above the site.
 */
public class SiteActivity extends Activity {
    private WebView web;
    private ImageButton backBtn;
    private ImageButton forwardBtn;
    private ProgressBar progress;
    private FrameLayout stage;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private boolean tv;
    private String siteDpadScript;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_site);

        web = (WebView) findViewById(R.id.site);
        tv = Tv.isTv(this);
        backBtn = (ImageButton) findViewById(R.id.backBtn);
        forwardBtn = (ImageButton) findViewById(R.id.forwardBtn);
        progress = (ProgressBar) findViewById(R.id.progress);
        stage = (FrameLayout) findViewById(R.id.stage);

        String url = getIntent().getStringExtra("url");
        String name = getIntent().getStringExtra("name");
        TextView title = (TextView) findViewById(R.id.title);
        title.setText(name != null && name.length() > 0 ? name : hostOf(url));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Same persistent cookie jar as the library, so sign-ins stick between
        // launches until the user clears them in Settings.
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.setBackgroundColor(0xFF000000);
        if (tv) {
            web.setFocusable(true);
            web.setFocusableInTouchMode(true);
            web.setOnKeyListener(new View.OnKeyListener() {
                @Override
                public boolean onKey(View v, int keyCode, KeyEvent event) {
                    String key = Tv.keyFor(keyCode);
                    if (key == null) return false;
                    if (event.getAction() == KeyEvent.ACTION_DOWN) sendSiteKey(key);
                    return true;
                }
            });
        }
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String target) {
                // Keep http(s) in-app; hand anything else back to the system.
                return !(target != null && (target.startsWith("http://") || target.startsWith("https://")));
            }

            @Override
            public void onPageFinished(WebView view, String target) {
                updateNav();
                if (tv) {
                    view.requestFocus();
                    installSiteDpad(view);
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (progress == null) return;
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customCallback = callback;
                view.setBackgroundColor(0xFF000000);
                stage.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                applyImmersive(true);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                stage.removeView(customView);
                customView = null;
                if (customCallback != null) customCallback.onCustomViewHidden();
                customCallback = null;
                applyImmersive(false);
            }
        });

        findViewById(R.id.exitBtn).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { finish(); }
        });
        findViewById(R.id.reloadBtn).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { web.reload(); }
        });
        backBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { if (web.canGoBack()) web.goBack(); }
        });
        forwardBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { if (web.canGoForward()) web.goForward(); }
        });

        updateNav();
        if (url != null) web.loadUrl(url);
        if (tv) web.requestFocus();
    }

    /**
     * A site is an ordinary desktop web page, so its own focus ring and
     * keyboard handling often cannot be reached with a TV remote. Install a
     * small navigation layer after every page load; it moves focus between
     * visible links/buttons, activates the highlighted item on OK/Enter, and
     * scrolls when there is no focusable item in that direction.
     */
    private void installSiteDpad(WebView view) {
        String script = siteDpadScript();
        if (script.length() == 0) return;
        view.evaluateJavascript(
                "window.__anystreamSiteNativeKeys = true;\n" + script, null);
    }

    private String siteDpadScript() {
        if (siteDpadScript != null) return siteDpadScript;
        try (InputStream input = getAssets().open("site-dpad.js")) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            siteDpadScript = new String(output.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            siteDpadScript = "";
        }
        return siteDpadScript;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (!tv || customView != null) return super.dispatchKeyEvent(event);
        String key = Tv.keyFor(event.getKeyCode());
        if (key == null) return super.dispatchKeyEvent(event);
        if (event.getAction() == KeyEvent.ACTION_DOWN) sendSiteKey(key);
        return true;
    }

    private void sendSiteKey(String key) {
        if (web == null) return;
        web.evaluateJavascript(
                "window.__anystreamSiteKey && window.__anystreamSiteKey('" + key + "')", null);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && tv && web != null) web.requestFocus();
    }

    private void updateNav() {
        boolean canBack = web.canGoBack();
        boolean canForward = web.canGoForward();
        backBtn.setEnabled(canBack);
        backBtn.setAlpha(canBack ? 1f : 0.35f);
        forwardBtn.setEnabled(canForward);
        forwardBtn.setAlpha(canForward ? 1f : 0.35f);
    }

    private void applyImmersive(boolean on) {
        View chrome = findViewById(R.id.chrome);
        if (on) {
            chrome.setVisibility(View.GONE);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        } else {
            chrome.setVisibility(View.VISIBLE);
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    private String hostOf(String url) {
        try {
            String host = Uri.parse(url).getHost();
            if (host == null) return "anystreamsite";
            return host.startsWith("www.") ? host.substring(4) : host;
        } catch (Throwable err) {
            return "anystreamsite";
        }
    }

    @Override
    public void onBackPressed() {
        if (customView == null && web != null && web.canGoBack()) {
            web.goBack();
            updateNav();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
        try {
            CookieManager.getInstance().flush();
        } catch (Throwable ignored) {
            // Nothing to persist.
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        updateNav();
        if (tv) web.requestFocus();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            stage.removeAllViews();
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
