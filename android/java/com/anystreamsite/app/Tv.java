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
        // The TV and phone APKs are separate packages built from the same
        // sources. This flag is compiled into each one, so a TV install never
        // depends on a device feature or a metadata lookup to enable its keys.
        if (BuildFlags.TV) return true;
        PackageManager pm = activity.getPackageManager();
        // The TV APK has a leanback launcher entry. This is part of the package
        // manifest, so it identifies our TV build even when the device omits
        // the leanback system feature or its metadata is returned as a string.
        try {
            if (pm.getLeanbackLaunchIntentForPackage(activity.getPackageName()) != null) return true;
        } catch (Exception ignored) {
            // Fall through to the other TV signals.
        }
        if (pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)) return true;
        try {
            ApplicationInfo info = pm.getApplicationInfo(
                    activity.getPackageName(), PackageManager.GET_META_DATA);
            if (info.metaData == null) return false;
            Object flag = info.metaData.get(META_TV);
            return flag != null && "true".equalsIgnoreCase(String.valueOf(flag));
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
