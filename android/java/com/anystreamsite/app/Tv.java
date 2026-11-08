package com.anystreamsite.app;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.view.KeyEvent;

/**
 * TV helpers shared by the library and the site viewer. The TV APK carries a
 * manifest flag, so a box that does not advertise leanback still gets native
 * D-pad handling. Some controllers also send system-navigation or gamepad
 * codes instead of the usual DPAD codes, so accept those too.
 */
final class Tv {
    static final String META_TV = "com.anystreamsite.tv";

    private Tv() {}

    static boolean isTv(Activity activity) {
        PackageManager pm = activity.getPackageManager();
        if (pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)) return true;
        try {
            ApplicationInfo info = pm.getApplicationInfo(
                    activity.getPackageName(), PackageManager.GET_META_DATA);
            return info.metaData != null && info.metaData.getBoolean(META_TV, false);
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Returns "up", "down", "left", "right", "select" or null. */
    static String keyFor(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_UP:
            case KeyEvent.KEYCODE_PAGE_UP:
                return "up";
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_DOWN:
            case KeyEvent.KEYCODE_PAGE_DOWN:
                return "down";
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_LEFT:
                return "left";
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_RIGHT:
                return "right";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_BUTTON_A:
            case KeyEvent.KEYCODE_BUTTON_SELECT:
                return "select";
            default:
                return null;
        }
    }
}
