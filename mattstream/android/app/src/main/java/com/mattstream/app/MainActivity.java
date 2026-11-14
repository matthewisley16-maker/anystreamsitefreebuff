package com.mattstream.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * MattStream for Android phones and Android TV.
 *
 * The desktop app does the hosting, so this is the client: it asks once for the
 * address the desktop shows, remembers it, and runs the shelf in a WebView with
 * D-pad support, fullscreen video and the hardware Back button wired up.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "mattstream";
    private static final String KEY_SERVER = "server";
    private static final int DEFAULT_PORT = 8096;

    private FrameLayout root;
    private TvWebView web;
    private View setupView;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private String serverUrl;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#07070B"));
        setContentView(root);

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        serverUrl = prefs.getString(KEY_SERVER, "");
        if (serverUrl == null || serverUrl.isEmpty()) {
            showSetup("Enter the address MattStream shows in the desktop app.");
        } else {
            loadServer(serverUrl);
        }
    }

    private int dp(float value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    /* ---------------- setup screen ---------------- */

    private void showSetup(String message) {
        removeWeb();
        if (setupView != null) {
            root.removeView(setupView);
            setupView = null;
        }

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_VERTICAL);
        column.setPadding(dp(40), dp(32), dp(40), dp(32));
        column.setBackgroundColor(Color.parseColor("#07070B"));

        TextView title = new TextView(this);
        title.setText("MattStream");
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 34);
        column.addView(title);

        TextView hint = new TextView(this);
        hint.setText(message);
        hint.setTextColor(Color.parseColor("#B9BCC8"));
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        hint.setPadding(0, dp(10), 0, dp(22));
        column.addView(hint);

        final EditText input = new EditText(this);
        input.setHint("192.168.1.24:8096");
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(Color.parseColor("#6E7280"));
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        if (serverUrl != null && !serverUrl.isEmpty()) input.setText(serverUrl);
        column.addView(input, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button connect = new Button(this);
        connect.setText("Connect");
        connect.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        buttonParams.topMargin = dp(20);
        column.addView(connect, buttonParams);

        View.OnClickListener submit = new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                String value = normalize(input.getText().toString());
                if (value.isEmpty()) return;
                serverUrl = value;
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_SERVER, value).apply();
                loadServer(value);
            }
        };
        connect.setOnClickListener(submit);
        input.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView view, int actionId, android.view.KeyEvent event) {
                submit.onClick(view);
                return true;
            }
        });

        setupView = column;
        root.addView(column, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        input.requestFocus();
        input.post(new Runnable() {
            @Override
            public void run() {
                input.setSelection(input.getText().length());
            }
        });
    }

    /** Accepts "192.168.1.24", "192.168.1.24:8096" or a full URL. */
    private static String normalize(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return "";
        if (!value.startsWith("http://") && !value.startsWith("https://")) value = "http://" + value;
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        String afterScheme = value.substring(value.indexOf("//") + 2);
        if (!afterScheme.contains(":")) value = value + ":" + DEFAULT_PORT;
        return value;
    }

    /* ---------------- the shelf ---------------- */

    private void removeWeb() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
    }

    private void loadServer(String url) {
        final String target = normalize(url);
        if (target.isEmpty()) return;
        removeWeb();
        if (setupView != null) {
            root.removeView(setupView);
            setupView = null;
        }

        TvWebView view = new TvWebView(this);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " MattStreamApp/1.1");

        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String link) {
                return !(link.startsWith("http://") || link.startsWith("https://"));
            }

            @Override
            public void onReceivedError(WebView v, int code, String description, String failingUrl) {
                if (failingUrl == null) return;
                if (!failingUrl.startsWith(target)) return;
                showSetup("Could not reach " + target + ".\n\nStart MattStream on the desktop, make sure both "
                        + "devices are on the same Wi-Fi, and allow it through Windows Firewall.");
            }
        });

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View v, CustomViewCallback callback) {
                if (fullscreenView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                fullscreenView = v;
                fullscreenCallback = callback;
                root.addView(v, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                applyImmersive(true);
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }
        });

        web = view;
        root.addView(view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        view.loadUrl(target + "/");
        view.requestFocus();
    }

    private void exitFullscreen() {
        if (fullscreenView == null) return;
        root.removeView(fullscreenView);
        fullscreenView = null;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        applyImmersive(false);
        if (fullscreenCallback != null) {
            fullscreenCallback.onCustomViewHidden();
            fullscreenCallback = null;
        }
        if (web != null) web.requestFocus();
    }

    private void applyImmersive(boolean on) {
        View decor = getWindow().getDecorView();
        if (on) {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        } else {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onBackPressed() {
        if (fullscreenView != null) {
            if (web != null) {
                web.evaluateJavascript("(function(){var v=document.querySelector('video');"
                        + "if(document.exitFullscreen){document.exitFullscreen().catch(function(){});}"
                        + "else if(v&&v.webkitExitFullscreen){v.webkitExitFullscreen();}})()", null);
            }
            return;
        }
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        removeWeb();
        super.onDestroy();
    }
}
