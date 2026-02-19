package com.cinesuper.tv;

import android.graphics.Color;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import android.util.Log;

  public class MainActivity extends BridgeActivity {
    private static final String TAG = "CineSuperExo";

  private void applyImmersive() {
    try {
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
      View decor = getWindow().getDecorView();
      int flags =
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
        View.SYSTEM_UI_FLAG_FULLSCREEN |
        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
      decor.setSystemUiVisibility(flags);

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        WindowInsetsController c = decor.getWindowInsetsController();
        if (c != null) {
          c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
          c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
      }
    } catch (Exception ignored) {}
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(UpdatePlugin.class);
    registerPlugin(ExoPlayerPlugin.class);
    super.onCreate(savedInstanceState);
    Log.w("Capacitor/ExoPlayerPlugin", "MainActivity build=2026-02-08T02:40Z");
    Log.e(TAG, "MainActivity onCreate (BUILD=2026-02-08T02:40Z)");
    try {
      WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    } catch (Exception ignored) {}
    applyImmersive();

    // Fundo preto no window/decor (evita tela branca na transição)
    View decor = getWindow().getDecorView();
    decor.setBackgroundColor(Color.BLACK);
    try {
      ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> WindowInsetsCompat.CONSUMED);
    } catch (Exception ignored) {}

    // Fundo preto no WebView do Capacitor (evita flash branco enquanto carrega)
    try {
      if (getBridge() != null && getBridge().getWebView() != null) {
        View webView = getBridge().getWebView();
        webView.setBackgroundColor(Color.BLACK);
        webView.setPadding(0, 0, 0, 0);
        webView.setTranslationX(0);
        webView.setTranslationY(0);
        try {
          ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> WindowInsetsCompat.CONSUMED);
        } catch (Exception ignored2) {}
      }
    } catch (Exception ignored) {}
  }

  @Override
  public void onResume() {
    super.onResume();
    Log.e(TAG, "MainActivity onResume");
    applyImmersive();
    try {
      if (getBridge() != null && getBridge().getWebView() != null) {
        getBridge().getWebView().setFocusable(true);
        getBridge().getWebView().setFocusableInTouchMode(true);
        getBridge().getWebView().requestFocus();
      }
    } catch (Exception ignored) {}
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (!hasFocus) return;
    applyImmersive();
    try {
      if (getBridge() != null && getBridge().getWebView() != null) {
        getBridge().getWebView().requestFocus();
      }
    } catch (Exception ignored) {}
  }
}
