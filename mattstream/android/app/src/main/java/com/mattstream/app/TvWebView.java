package com.mattstream.app;

import android.content.Context;
import android.os.Build;
import android.view.KeyEvent;
import android.webkit.WebView;

/**
 * Hands remote-control keys to the page as real keydown events.
 *
 * A WebView would otherwise use the arrow keys for its own scrolling, so the
 * shelf's D-pad navigation would never see them. OK/Enter is turned into a click
 * on whatever the page has focused, so tiles and buttons behave the same as a
 * touch there.
 */
public class TvWebView extends WebView {

    private static final String FOCUS_KEY_JS =
            "(function(){var e=document.activeElement;"
                    + "if(e&&(e.tagName==='BUTTON'||e.tagName==='A'||e.tagName==='SELECT')){e.click();return;}"
                    + "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));})()";

    public TvWebView(Context context) {
        super(context);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String name = null;

        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP:
                name = "ArrowUp";
                break;
            case KeyEvent.KEYCODE_DPAD_DOWN:
                name = "ArrowDown";
                break;
            case KeyEvent.KEYCODE_DPAD_LEFT:
                name = "ArrowLeft";
                break;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                name = "ArrowRight";
                break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                    evaluateJavascript(FOCUS_KEY_JS, null);
                }
                return true;
            default:
                break;
        }

        if (name == null) return super.dispatchKeyEvent(event);

        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'" + name
                    + "',bubbles:true,cancelable:true}))", null);
        }
        return true;
    }
}
