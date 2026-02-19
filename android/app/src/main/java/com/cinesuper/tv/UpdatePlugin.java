package com.cinesuper.tv;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.content.SharedPreferences;

import androidx.core.content.FileProvider;

import com.getcapacitor.Bridge;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.io.File;

@CapacitorPlugin(name = "UpdatePlugin")
public class UpdatePlugin extends Plugin {
  private long currentDownloadId = -1L;
  private Handler handler;
  private Runnable progressTask;
  private static final String PREFS = "cs_update_prefs";
  private static final String KEY_APK_URI = "apk_uri";

  @PluginMethod
  public void downloadApk(PluginCall call) {
    String url = call.getString("url", "");
    if (url == null || url.trim().isEmpty()) {
      call.reject("missing_url");
      return;
    }

    Context ctx = getContext();

    // If we already have a downloaded APK, try to open installer directly.
    String cachedUri = getCachedApkUri(ctx);
    if (cachedUri != null && !cachedUri.isEmpty()) {
      if (!apkExists(ctx, cachedUri)) {
        clearCachedApkUri(ctx);
      } else {
        if (!canRequestInstalls(ctx)) {
          requestInstallPermission(ctx);
          emitError("install_permission_required", 0);
          call.reject("install_permission_required");
          return;
        }
        openInstaller(cachedUri);
        call.resolve();
        return;
      }
    }

    if (cachedUri != null && !cachedUri.isEmpty()) {
      if (!canRequestInstalls(ctx)) {
        requestInstallPermission(ctx);
        emitError("install_permission_required", 0);
        call.reject("install_permission_required");
        return;
      }
      openInstaller(cachedUri);
      call.resolve();
      return;
    }

    DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
    if (dm == null) {
      call.reject("download_manager_unavailable");
      return;
    }

    String fileName = "cinesuper-tv-update.apk";
    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
    req.setAllowedOverMetered(true);
    req.setAllowedOverRoaming(true);
    req.setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, fileName);

    currentDownloadId = dm.enqueue(req);

    startProgressLoop(dm);
    call.resolve();
  }

  private void startProgressLoop(DownloadManager dm) {
    stopProgressLoop();

    handler = new Handler(Looper.getMainLooper());
    progressTask = new Runnable() {
      @Override
      public void run() {
        try {
          DownloadManager.Query q = new DownloadManager.Query();
          q.setFilterById(currentDownloadId);
          Cursor c = dm.query(q);
          if (c != null && c.moveToFirst()) {
            int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long downloaded = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));

            emitProgress(downloaded, total);

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
              String localUri = c.getString(c.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI));
              c.close();
              stopProgressLoop();
              cacheApkUri(getContext(), localUri);
              if (!canRequestInstalls(getContext())) {
                requestInstallPermission(getContext());
                emitError("install_permission_required", 0);
                return;
              }
              openInstaller(localUri);
              return;
            }

            if (status == DownloadManager.STATUS_FAILED) {
              int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
              c.close();
              stopProgressLoop();
              emitError("download_failed", reason);
              return;
            }
          }
          if (c != null) c.close();
        } catch (Exception ignored) {
          stopProgressLoop();
          return;
        }

        handler.postDelayed(this, 500);
      }
    };

    handler.postDelayed(progressTask, 200);
  }

  private void stopProgressLoop() {
    if (handler != null && progressTask != null) {
      handler.removeCallbacks(progressTask);
    }
    handler = null;
    progressTask = null;
  }

  private void emitProgress(long downloaded, long total) {
    double progress = 0d;
    if (total > 0) {
      progress = (double) downloaded / (double) total;
    }

    final String js = "window.dispatchEvent(new CustomEvent('cs:update-progress', {detail:{progress:"
      + progress + ",received:" + downloaded + ",total:" + total + "}}));";

    try {
      Bridge bridge = getBridge();
      if (bridge != null && bridge.getWebView() != null) {
        bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(js, null));
      }
    } catch (Exception ignored) {}
  }

  private void emitError(String code, int reason) {
    final String js = "window.dispatchEvent(new CustomEvent('cs:update-error', {detail:{code:'"
      + code + "',reason:" + reason + "}}));";

    try {
      Bridge bridge = getBridge();
      if (bridge != null && bridge.getWebView() != null) {
        bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(js, null));
      }
    } catch (Exception ignored) {}
  }

  private void openInstaller(String localUri) {
    if (localUri == null || localUri.isEmpty()) return;

    try {
      Context ctx = getContext();
      Uri uri = Uri.parse(localUri);
      Uri contentUri = uri;

      if ("file".equalsIgnoreCase(uri.getScheme())) {
        File file = new File(uri.getPath());
        contentUri = FileProvider.getUriForFile(
          ctx,
          ctx.getPackageName() + ".fileprovider",
          file
        );
      }

      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
      intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
      ctx.startActivity(intent);
    } catch (Exception ignored) {}
  }

  private boolean canRequestInstalls(Context ctx) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
    try {
      return ctx.getPackageManager().canRequestPackageInstalls();
    } catch (Exception e) {
      return false;
    }
  }

  private void requestInstallPermission(Context ctx) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    try {
      Uri pkgUri = Uri.parse("package:" + ctx.getPackageName());
      Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, pkgUri);
      intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      ctx.startActivity(intent);
    } catch (Exception ignored) {}
  }

  private void cacheApkUri(Context ctx, String uri) {
    try {
      SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      prefs.edit().putString(KEY_APK_URI, uri).apply();
    } catch (Exception ignored) {}
  }

  private void clearCachedApkUri(Context ctx) {
    try {
      SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      prefs.edit().remove(KEY_APK_URI).apply();
    } catch (Exception ignored) {}
  }

  private String getCachedApkUri(Context ctx) {
    try {
      SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      return prefs.getString(KEY_APK_URI, null);
    } catch (Exception ignored) {
      return null;
    }
  }

  private boolean apkExists(Context ctx, String uriString) {
    try {
      Uri uri = Uri.parse(uriString);
      if ("file".equalsIgnoreCase(uri.getScheme())) {
        File f = new File(uri.getPath());
        return f.exists();
      }
      return true;
    } catch (Exception ignored) {
      return false;
    }
  }
}
