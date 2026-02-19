package com.cinesuper.tv;

import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.SurfaceTexture;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.TextureView;
import android.widget.FrameLayout;
import android.view.WindowInsets;

import androidx.annotation.Nullable;

import com.getcapacitor.Bridge;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.datasource.HttpDataSource;

import com.google.common.collect.ImmutableList;

import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "ExoPlayerPlugin")
public class ExoPlayerPlugin extends Plugin {
  private static final String TAG = "CineSuperExo";
  private static final int[][] RECOVERY_CONSTRAINTS = new int[][]{
    {3840, 2160, 30},
    {1920, 1080, 30},
    {1280, 720, 30},
    {854, 480, 30}
  };
  private ExoPlayer player;
  private TextureView textureView;
  private DefaultTrackSelector trackSelector;
  private int viewW = 0;
  private int viewH = 0;
  private int videoW = 0;
  private int videoH = 0;
  private float videoPixelRatio = 1f;
  private int videoRotation = 0;
  private View webViewRef;
  private ViewGroup parentRef;
  private View.OnLayoutChangeListener webLayoutListener;
  private float manualOffsetY = 0f;
  private boolean preferSdr = true;
  private boolean preferSdrApplied = false;
  private boolean visibleWanted = true;
  private boolean waitingFirstFrame = false;
  private int configuredMaxVideoWidth = 0;
  private int configuredMaxVideoHeight = 0;
  private int configuredMaxVideoFrameRate = 0;
  private int maxVideoWidth = 0;
  private int maxVideoHeight = 0;
  private int maxVideoFrameRate = 0;
  private int recoveryProfileIndex = 0;
  private long lastRecoverAtMs = 0L;

  private Handler timeHandler;
  private Runnable timeTick;

  private final List<TrackRef> audioRefs = new ArrayList<>();
  private final List<TrackRef> textRefs = new ArrayList<>();

  private static class TrackRef {
    public Tracks.Group group;
    public int trackIndex;
    public String label;
    public String lang;
  }

  private void runOnUiThread(Runnable r) {
    if (getActivity() == null) return;
    getActivity().runOnUiThread(r);
  }

  private void ensurePlayer() {
    if (player != null) return;
    if (getContext() == null) return;

    try {
      trackSelector = new DefaultTrackSelector(getContext());
      player = new ExoPlayer.Builder(getContext()).setTrackSelector(trackSelector).build();
      try {
        DefaultTrackSelector.Parameters.Builder builder = trackSelector.buildUponParameters();
        applyVideoConstraints(builder);
        trackSelector.setParameters(builder);
      } catch (Exception ignored) {}
      Log.i(TAG, "ensurePlayer ok");
    } catch (Exception e) {
      Log.e(TAG, "ensurePlayer failed", e);
      return;
    }

    player.addListener(new Player.Listener() {
      @Override
      public void onPlaybackStateChanged(int state) {
        emitState();
        if (state == Player.STATE_READY) {
          waitingFirstFrame = false;
          runOnUiThread(ExoPlayerPlugin.this::applyVisibility);
        }
        if (state == Player.STATE_ENDED) {
          notifyListeners("ended", new JSObject());
        }
      }

      @Override
      public void onIsPlayingChanged(boolean isPlaying) {
        emitState();
        if (isPlaying) {
          waitingFirstFrame = false;
          runOnUiThread(ExoPlayerPlugin.this::applyVisibility);
        }
      }

      @Override
      public void onPlayerError(PlaybackException error) {
        if (error != null) {
          Log.e(TAG, "player error: " + error.getErrorCodeName() + " / " + error.getMessage(), error);
          if (error.errorCode == PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES) {
            long now = System.currentTimeMillis();
            if (now - lastRecoverAtMs > 1500) {
              lastRecoverAtMs = now;
              boolean tightened = tightenConstraintsForRecovery();
              Log.w(TAG, "codec exceeds capabilities; forcing constraints and retry (tightened=" + tightened + ")");
              preferSdrApplied = false;
              if (trackSelector != null) {
                try {
                  DefaultTrackSelector.Parameters.Builder builder = trackSelector.buildUponParameters();
                  applyVideoConstraints(builder);
                  trackSelector.setParameters(builder);
                } catch (Exception ignored) {}
              }
              if (tightened && player != null) {
                long pos = Math.max(0, player.getCurrentPosition());
                player.prepare();
                player.seekTo(pos);
                player.play();
              }
              if (!tightened) {
                emitError(error);
              }
            }
            return; // evita mostrar erro na UI quando conseguimos recuperar
          }
        } else {
          Log.e(TAG, "player error: null");
        }
        emitError(error);
      }

      @Override
      public void onRenderedFirstFrame() {
        waitingFirstFrame = false;
        runOnUiThread(ExoPlayerPlugin.this::applyVisibility);
      }

      @Override
      public void onTracksChanged(Tracks tracks) {
        emitTracks(tracks);
        applyPreferSdr(tracks);
      }

      @Override
      public void onVideoSizeChanged(androidx.media3.common.VideoSize videoSize) {
        videoW = Math.max(0, videoSize.width);
        videoH = Math.max(0, videoSize.height);
        videoPixelRatio = videoSize.pixelWidthHeightRatio > 0 ? videoSize.pixelWidthHeightRatio : 1f;
        videoRotation = videoSize.unappliedRotationDegrees;
        updateTextureBufferSize();
        applyTextureTransform();
      }
    });

    startTimeLoop();
  }

  private void ensureView() {
    if (textureView != null || getBridge() == null) return;

    Bridge bridge = getBridge();
    if (bridge == null || bridge.getWebView() == null) return;

    try {
      textureView = new TextureView(getContext());
      // Em algumas TVs, TextureView não-opaco gera "película escura"/ghosting.
      textureView.setOpaque(true);
      textureView.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
        @Override
        public void onSurfaceTextureAvailable(SurfaceTexture surface, int width, int height) {
          viewW = width;
          viewH = height;
          updateTextureBufferSize();
          applyTextureTransform();
        }

        @Override
        public void onSurfaceTextureSizeChanged(SurfaceTexture surface, int width, int height) {
          viewW = width;
          viewH = height;
          updateTextureBufferSize();
          applyTextureTransform();
        }

        @Override
        public boolean onSurfaceTextureDestroyed(SurfaceTexture surface) {
          return true;
        }

        @Override
        public void onSurfaceTextureUpdated(SurfaceTexture surface) {}
      });
      boolean textureOk = attachTextureView(textureView);
      Log.i(TAG, "ensureView ok (texture=" + textureOk + ")");
    } catch (Exception e) {
      Log.e(TAG, "ensureView failed", e);
      return;
    }

    View webView = bridge.getWebView();
    webViewRef = webView;
    ViewGroup parent = null;
    try {
      parent = (ViewGroup) webView.getParent();
    } catch (Exception ignored) {}
    if (parent == null) {
      try {
        if (getActivity() != null && getActivity().getWindow() != null) {
          View decor = getActivity().getWindow().getDecorView();
          if (decor instanceof ViewGroup) parent = (ViewGroup) decor;
        }
      } catch (Exception ignored) {}
    }
    if (parent == null) return;
    parentRef = parent;

    ViewGroup.LayoutParams lp = null;
    try {
      ViewGroup.LayoutParams wlp = webView.getLayoutParams();
      if (wlp != null) {
        if (wlp instanceof ViewGroup.MarginLayoutParams) {
          ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) wlp;
          ViewGroup.MarginLayoutParams nlp = new ViewGroup.MarginLayoutParams(mlp);
          lp = nlp;
        } else {
          lp = new ViewGroup.LayoutParams(wlp);
        }
      }
    } catch (Exception ignored) {}
    if (lp == null) {
      lp = new ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      );
    }

    // coloca atrás do WebView
    try {
      try {
        parent.setPadding(0, 0, 0, 0);
        parent.setClipToPadding(false);
        parent.setClipChildren(false);
      } catch (Exception ignored) {}

      try {
        webView.setPadding(0, 0, 0, 0);
        webView.bringToFront();
      } catch (Exception ignored) {}

      parent.addView(textureView, 0, lp);
      Log.i(TAG, "addView ok");
    } catch (Exception e) {
      Log.e(TAG, "addView failed", e);
    }

    try {
      textureView.setTranslationX(0);
      textureView.setTranslationY(0);
    } catch (Exception ignored) {}

    try {
      if (webLayoutListener != null) {
        webView.removeOnLayoutChangeListener(webLayoutListener);
      }
      webLayoutListener =
        (v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> syncTextureToParent();
      parent.addOnLayoutChangeListener(webLayoutListener);
    } catch (Exception ignored) {}

    try {
      webView.post(this::syncTextureToParent);
    } catch (Exception ignored) {}
  }

  private boolean attachTextureView(TextureView tv) {
    try {
      if (player != null) {
        player.setVideoTextureView(tv);
        Log.i(TAG, "player.setVideoTextureView ok");
        applyTextureTransform();
        return true;
      }
      Log.w(TAG, "player is null, cannot set texture view");
      return true;
    } catch (Exception e) {
      Log.w(TAG, "player.setVideoTextureView failed", e);
      return false;
    }
  }

  private void applyVisibility() {
    if (textureView == null) return;
    if (!visibleWanted) {
      textureView.setVisibility(View.GONE);
      textureView.setAlpha(1f);
      return;
    }
    textureView.setVisibility(View.VISIBLE);
    textureView.setAlpha(1f);
  }

  private void setWebViewTransparent(boolean transparent) {
    try {
      Bridge bridge = getBridge();
      if (bridge != null && bridge.getWebView() != null) {
        bridge.getWebView().setBackgroundColor(transparent ? Color.TRANSPARENT : Color.BLACK);
      }
    } catch (Exception ignored) {}
  }

    private void applyTextureTransform() {
    if (textureView == null) return;
    final int vw = viewW > 0 ? viewW : textureView.getWidth();
    final int vh = viewH > 0 ? viewH : textureView.getHeight();
    if (vw <= 0 || vh <= 0 || videoW <= 0 || videoH <= 0) return;

    final int[] insets = getVisibleInsets(vh);
    int insetTop = insets[0];
    int insetBottom = insets[1];
    if (insetTop + insetBottom >= vh - 2) {
      insetTop = 0;
      insetBottom = 0;
    }
    final float pixelRatio = videoPixelRatio > 0 ? videoPixelRatio : 1f;

    float srcW = videoW * pixelRatio;
    float srcH = videoH;
    if (videoRotation == 90 || videoRotation == 270) {
      float tmp = srcW;
      srcW = srcH;
      srcH = tmp;
    }

    final float targetW = vw;
    final float targetH = Math.max(0, vh - insetTop - insetBottom);
    final float scale = Math.min(targetW / srcW, targetH / srcH);

    final float scaledW = srcW * scale;
    final float scaledH = srcH * scale;
    final float sx = scaledW / vw;
    final float sy = scaledH / vh;
    final float dx = (vw - scaledW) / 2f;
    final float dy = insetTop + (targetH - scaledH) / 2f + manualOffsetY;

    try { textureView.setTransform(new Matrix()); } catch (Exception ignored) {}

    textureView.setPivotX(0f);
    textureView.setPivotY(0f);
    textureView.setScaleX(sx);
    textureView.setScaleY(sy);
    textureView.setTranslationX(dx);
    textureView.setTranslationY(dy);

    Log.i(TAG, "applyTransform view=" + vw + "x" + vh + " video=" + videoW + "x" + videoH +
      " pr=" + pixelRatio + " rot=" + videoRotation +
      " sx=" + sx + " sy=" + sy + " dx=" + dx + " dy=" + dy +
      " scaled=" + scaledW + "x" + scaledH +
      " inTop=" + insetTop + " inBottom=" + insetBottom + " offY=" + manualOffsetY);
  }

  private void updateTextureBufferSize() {
    if (textureView == null) return;
    if (videoW <= 0 || videoH <= 0) return;
    try {
      SurfaceTexture st = textureView.getSurfaceTexture();
      if (st == null) return;
      int bw = videoW;
      int bh = videoH;
      if (videoRotation == 90 || videoRotation == 270) {
        int tmp = bw;
        bw = bh;
        bh = tmp;
      }
      st.setDefaultBufferSize(bw, bh);
      Log.i(TAG, "setDefaultBufferSize w=" + bw + " h=" + bh);
    } catch (Exception e) {
      Log.w(TAG, "setDefaultBufferSize failed", e);
    }
  }

  private boolean isHdrFormat(Format fmt) {
    if (fmt == null || fmt.colorInfo == null) return false;
    int tr = fmt.colorInfo.colorTransfer;
    return tr == C.COLOR_TRANSFER_ST2084 || tr == C.COLOR_TRANSFER_HLG;
  }

  private String colorInfoToString(Format fmt) {
    if (fmt == null || fmt.colorInfo == null) return "none";
    return "cs=" + fmt.colorInfo.colorSpace +
      " tr=" + fmt.colorInfo.colorTransfer +
      " rg=" + fmt.colorInfo.colorRange;
  }

  private void applyPreferSdr(@Nullable Tracks tracks) {
    if (!preferSdr || preferSdrApplied || trackSelector == null || tracks == null) return;

    TrackSelectionOverride bestOverride = null;
    Format bestFmt = null;
    long bestScore = -1;

    for (int gi = 0; gi < tracks.getGroups().size(); gi++) {
      Tracks.Group group = tracks.getGroups().get(gi);
      if (group.getType() != C.TRACK_TYPE_VIDEO) continue;

      for (int ti = 0; ti < group.length; ti++) {
        Format fmt = group.getTrackFormat(ti);
        if (isHdrFormat(fmt)) continue;
        if (maxVideoHeight > 0 && fmt.height > maxVideoHeight) continue;
        if (maxVideoWidth > 0 && fmt.width > maxVideoWidth) continue;
        if (maxVideoFrameRate > 0 && fmt.frameRate > 0 && fmt.frameRate > maxVideoFrameRate) continue;

        int h = Math.max(0, fmt.height);
        int br = Math.max(0, fmt.bitrate);
        long score = (long) h * 1_000_000L + br;
        if (score > bestScore) {
          bestScore = score;
          bestFmt = fmt;
          bestOverride = new TrackSelectionOverride(group.getMediaTrackGroup(), ImmutableList.of(ti));
        }
      }
    }

    preferSdrApplied = true;

    if (bestOverride != null) {
      DefaultTrackSelector.Parameters.Builder builder = trackSelector.buildUponParameters();
      applyVideoConstraints(builder);
      builder.clearOverridesOfType(C.TRACK_TYPE_VIDEO);
      builder.addOverride(bestOverride);
      trackSelector.setParameters(builder);

      Log.i(TAG, "preferSDR: selected " +
        (bestFmt != null ? (bestFmt.width + "x" + bestFmt.height) : "unknown") +
        " bitrate=" + (bestFmt != null ? bestFmt.bitrate : 0) +
        " color=" + colorInfoToString(bestFmt));
    } else {
      Log.i(TAG, "preferSDR: no SDR track found");
    }
  }

  private int clampToConfiguredMax(int configured, int fallback) {
    if (configured > 0) return Math.min(configured, fallback);
    return fallback;
  }

  private boolean tightenConstraintsForRecovery() {
    int prevW = maxVideoWidth;
    int prevH = maxVideoHeight;
    int prevFps = maxVideoFrameRate;

    for (int i = Math.max(0, recoveryProfileIndex); i < RECOVERY_CONSTRAINTS.length; i++) {
      int[] profile = RECOVERY_CONSTRAINTS[i];
      int targetW = clampToConfiguredMax(configuredMaxVideoWidth, profile[0]);
      int targetH = clampToConfiguredMax(configuredMaxVideoHeight, profile[1]);
      int targetFps = clampToConfiguredMax(configuredMaxVideoFrameRate, profile[2]);

      boolean canTighten =
        (targetW > 0 && (maxVideoWidth <= 0 || targetW < maxVideoWidth)) ||
        (targetH > 0 && (maxVideoHeight <= 0 || targetH < maxVideoHeight)) ||
        (targetFps > 0 && (maxVideoFrameRate <= 0 || targetFps < maxVideoFrameRate));

      recoveryProfileIndex = i + 1;
      if (!canTighten) continue;

      maxVideoWidth = targetW;
      maxVideoHeight = targetH;
      maxVideoFrameRate = targetFps;
      Log.w(
        TAG,
        "recovery profile " + recoveryProfileIndex + "/" + RECOVERY_CONSTRAINTS.length +
          " -> max=" + maxVideoWidth + "x" + maxVideoHeight + " fps=" + maxVideoFrameRate
      );
      return true;
    }

    return maxVideoWidth != prevW || maxVideoHeight != prevH || maxVideoFrameRate != prevFps;
  }

  private void applyVideoConstraints(DefaultTrackSelector.Parameters.Builder builder) {
    int w = maxVideoWidth > 0 ? maxVideoWidth : Integer.MAX_VALUE;
    int h = maxVideoHeight > 0 ? maxVideoHeight : Integer.MAX_VALUE;
    if (maxVideoWidth > 0 || maxVideoHeight > 0) {
      builder.setMaxVideoSize(w, h);
    }
    if (maxVideoFrameRate > 0) {
      builder.setMaxVideoFrameRate((int) Math.round(maxVideoFrameRate));
    }
    builder.setExceedVideoConstraintsIfNecessary(false);
    builder.setExceedRendererCapabilitiesIfNecessary(false);
  }

  private int[] getVisibleInsets(int vh) {
    int top = 0;
    int bottom = 0;
    try {
      if (getActivity() != null && getActivity().getWindow() != null) {
        View decor = getActivity().getWindow().getDecorView();
        if (decor != null) {
          Rect r = new Rect();
          decor.getWindowVisibleDisplayFrame(r);
          if (r.height() > 0 && r.height() <= vh) {
            top = Math.max(top, r.top);
            bottom = Math.max(bottom, Math.max(0, vh - r.bottom));
          }
          WindowInsets wi = decor.getRootWindowInsets();
          if (wi != null) {
            top = Math.max(top, wi.getStableInsetTop());
            bottom = Math.max(bottom, wi.getStableInsetBottom());
          }
        }
      }
    } catch (Exception ignored) {}
    return new int[]{ top, bottom };
  }

  private void syncTextureToParent() {
    if (textureView == null) return;
    try {
      int w = 0;
      int h = 0;
      if (parentRef != null) {
        w = parentRef.getWidth();
        h = parentRef.getHeight();
      }
      if (w <= 0 || h <= 0) {
        if (webViewRef != null) {
          w = webViewRef.getWidth();
          h = webViewRef.getHeight();
        }
      }
      if (w <= 0 || h <= 0) return;

      int left = 0;
      int top = 0;
      ViewGroup.LayoutParams lp = textureView.getLayoutParams();
      if (lp instanceof ViewGroup.MarginLayoutParams) {
        ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) lp;
        mlp.width = w;
        mlp.height = h;
        mlp.leftMargin = left;
        mlp.topMargin = top;
        textureView.setLayoutParams(mlp);
      } else if (lp != null) {
        lp.width = w;
        lp.height = h;
        textureView.setLayoutParams(lp);
      }

      textureView.setX(left);
      textureView.setY(top);
      textureView.setTranslationX(0);
      textureView.setTranslationY(0);

      viewW = w;
      viewH = h;
      applyTextureTransform();

      Log.w("Capacitor/ExoPlayerPlugin", "syncTexture parent w=" + w + " h=" + h +
        " left=" + left + " top=" + top);
    } catch (Exception e) {
      Log.w(TAG, "syncTextureToParent failed", e);
    }
  }

  private String normalizeUrl(String url) {
    if (url == null) return "";
    String u = url.trim();
    if (u.isEmpty()) return u;
    String low = u.toLowerCase();
    if (low.equals("/intro.mp4") || low.equals("intro.mp4") || (low.contains("localhost") && low.endsWith("/intro.mp4"))) {
      return "asset:///public/intro.mp4";
    }
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    if (u.startsWith("/")) {
      String base = "https://localhost";
      try {
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
          String wv = bridge.getWebView().getUrl();
          if (wv != null && wv.startsWith("http")) {
            Uri b = Uri.parse(wv);
            String host = b.getHost();
            String scheme = b.getScheme();
            int port = b.getPort();
            if (host != null && scheme != null) {
              base = scheme + "://" + host + (port > 0 ? ":" + port : "");
            }
          }
        }
      } catch (Exception ignored) {}
      return base + u;
    }
    return u;
  }

  private void startTimeLoop() {
    stopTimeLoop();
    timeHandler = new Handler(Looper.getMainLooper());
    timeTick = new Runnable() {
      @Override
      public void run() {
        emitState();
        if (timeHandler != null) timeHandler.postDelayed(this, 1000);
      }
    };
    timeHandler.postDelayed(timeTick, 1000);
  }

  private void stopTimeLoop() {
    if (timeHandler != null && timeTick != null) {
      timeHandler.removeCallbacks(timeTick);
    }
    timeHandler = null;
    timeTick = null;
  }

  private void emitState() {
    if (player == null) return;
    long posMs = player.getCurrentPosition();
    long durMs = player.getDuration();
    long bufMs = player.getBufferedPosition();
    boolean isPlaying = player.isPlaying();
    int state = player.getPlaybackState();

    JSObject payload = new JSObject();
    payload.put("positionSec", posMs / 1000d);
    payload.put("durationSec", durMs > 0 ? durMs / 1000d : 0);
    payload.put("bufferedSec", bufMs > 0 ? bufMs / 1000d : 0);
    payload.put("isPlaying", isPlaying);
    payload.put("state", state);

    try {
      notifyListeners("state", payload, true);
    } catch (Exception e) {
      Log.e(TAG, "emitState notify failed", e);
    }
  }

  private void emitError(PlaybackException error) {
    JSObject payload = new JSObject();
    String codeName = error != null ? error.getErrorCodeName() : "";
    String msg = error != null && error.getMessage() != null ? error.getMessage() : codeName;
    payload.put("message", msg != null && !msg.isEmpty() ? msg : "player_error");
    payload.put("code", error != null ? error.errorCode : 0);
    payload.put("codeName", codeName);

    int http = 0;
    Throwable cause = error != null ? error.getCause() : null;
    if (cause instanceof HttpDataSource.InvalidResponseCodeException) {
      http = ((HttpDataSource.InvalidResponseCodeException) cause).responseCode;
    }
    payload.put("http", http);

    try {
      notifyListeners("error", payload, true);
    } catch (Exception e) {
      Log.e(TAG, "emitError notify failed", e);
    }
  }

  private void emitTracks(@Nullable Tracks tracks) {
    audioRefs.clear();
    textRefs.clear();

    int selectedAudio = -1;
    int selectedText = -1;

    JSArray audioArr = new JSArray();
    JSArray textArr = new JSArray();

    if (tracks != null) {
      for (int gi = 0; gi < tracks.getGroups().size(); gi++) {
        Tracks.Group group = tracks.getGroups().get(gi);
        int type = group.getType();

        for (int ti = 0; ti < group.length; ti++) {
          Format fmt = group.getTrackFormat(ti);
          String lang = fmt.language == null ? "" : fmt.language;
          String label = fmt.label != null ? fmt.label : (lang.isEmpty() ? "" : lang.toUpperCase());

          if (type == C.TRACK_TYPE_AUDIO) {
            TrackRef ref = new TrackRef();
            ref.group = group;
            ref.trackIndex = ti;
            ref.label = label;
            ref.lang = lang;
            int idx = audioRefs.size();
            audioRefs.add(ref);

            JSObject o = new JSObject();
            o.put("name", label.isEmpty() ? ("Faixa " + (idx + 1)) : label);
            o.put("lang", lang);
            audioArr.put(o);

            if (group.isTrackSelected(ti)) selectedAudio = idx;
          }

          if (type == C.TRACK_TYPE_TEXT) {
            TrackRef ref = new TrackRef();
            ref.group = group;
            ref.trackIndex = ti;
            ref.label = label;
            ref.lang = lang;
            int idx = textRefs.size();
            textRefs.add(ref);

            JSObject o = new JSObject();
            o.put("idx", idx);
            o.put("label", label.isEmpty() ? ("Legenda " + (idx + 1)) : label);
            o.put("language", lang);
            o.put("kind", "subtitles");
            o.put("mode", group.isTrackSelected(ti) ? "showing" : "disabled");
            textArr.put(o);

            if (group.isTrackSelected(ti)) selectedText = idx;
          }
        }
      }
    }

    JSObject payload = new JSObject();
    payload.put("audio", audioArr);
    payload.put("text", textArr);
    payload.put("selectedAudio", selectedAudio);
    payload.put("selectedText", selectedText);
    try {
      notifyListeners("tracks", payload, true);
    } catch (Exception e) {
      Log.e(TAG, "emitTracks notify failed", e);
    }
  }

  @PluginMethod
  public void init(PluginCall call) {
    boolean transparent = call.getBoolean("transparent", true);
    preferSdr = call.getBoolean("preferSdr", true);
    preferSdrApplied = false;
    configuredMaxVideoWidth = call.getInt("maxVideoWidth", 0);
    configuredMaxVideoHeight = call.getInt("maxVideoHeight", 0);
    double fps = call.getDouble("maxVideoFps", 0d);
    configuredMaxVideoFrameRate = (int) Math.round(fps > 0 ? fps : 0);
    maxVideoWidth = configuredMaxVideoWidth;
    maxVideoHeight = configuredMaxVideoHeight;
    maxVideoFrameRate = configuredMaxVideoFrameRate;
    recoveryProfileIndex = 0;
    waitingFirstFrame = false;
    runOnUiThread(() -> {
      Log.w("Capacitor/ExoPlayerPlugin", "CineSuperExo build=2026-02-08T02:40Z");
      Log.e(TAG, "init (BUILD=2026-02-08T02:40Z)");
      Log.i(TAG, "constraints max=" + maxVideoWidth + "x" + maxVideoHeight + " fps=" + maxVideoFrameRate);
      ensurePlayer();
      ensureView();
      setWebViewTransparent(transparent);
    });
    call.resolve();
  }

  @PluginMethod
  public void setVisible(PluginCall call) {
    boolean visible = call.getBoolean("visible", true);
    runOnUiThread(() -> {
      Log.i(TAG, "setVisible: " + visible);
      visibleWanted = visible;
      applyVisibility();
    });
    call.resolve();
  }

  @PluginMethod
  public void setSource(PluginCall call) {
    if (player == null) ensurePlayer();
    if (player == null) {
      call.reject("player_not_ready");
      return;
    }

    preferSdrApplied = false;
    maxVideoWidth = configuredMaxVideoWidth;
    maxVideoHeight = configuredMaxVideoHeight;
    maxVideoFrameRate = configuredMaxVideoFrameRate;
    recoveryProfileIndex = 0;
    waitingFirstFrame = true;
    runOnUiThread(this::applyVisibility);

    String rawUrl = call.getString("url", "");
    String url = normalizeUrl(rawUrl);
    double startPos = call.getDouble("startPositionSec", 0d);
    JSArray subs = call.getArray("subtitles");

    if (url == null || url.trim().isEmpty()) {
      call.reject("missing_url");
      return;
    }

    String lowerUrl = url != null ? url.toLowerCase() : "";
    String mime = null;
    if (lowerUrl.contains(".m3u8")) mime = MimeTypes.APPLICATION_M3U8;
    else if (lowerUrl.contains(".mp4")) mime = MimeTypes.VIDEO_MP4;

    MediaItem.Builder itemBuilder = new MediaItem.Builder().setUri(Uri.parse(url));
    if (mime != null) itemBuilder.setMimeType(mime);

    if (subs != null && subs.length() > 0) {
      List<MediaItem.SubtitleConfiguration> subtitleConfigs = new ArrayList<>();
      for (int i = 0; i < subs.length(); i++) {
        JSObject s = null;
        try {
          Object raw = subs.get(i);
          if (raw instanceof JSObject) {
            s = (JSObject) raw;
          } else if (raw instanceof JSONObject) {
            s = JSObject.fromJSONObject((JSONObject) raw);
          }
        } catch (JSONException ignored) {}
        if (s == null) continue;
        String sUrl = s.getString("url", "");
        if (sUrl == null || sUrl.trim().isEmpty()) continue;

        String lang = s.getString("lang", "");
        String label = s.getString("label", "");
        boolean isDefault = s.getBoolean("isDefault", false);

        String subMime = MimeTypes.TEXT_VTT;
        String lower = sUrl.toLowerCase();
        if (lower.endsWith(".srt")) subMime = MimeTypes.APPLICATION_SUBRIP;
        else if (lower.endsWith(".m3u8")) continue;

        MediaItem.SubtitleConfiguration cfg = new MediaItem.SubtitleConfiguration.Builder(Uri.parse(sUrl))
          .setMimeType(subMime)
          .setLanguage(lang)
          .setLabel(label)
          .setSelectionFlags(isDefault ? C.SELECTION_FLAG_DEFAULT : 0)
          .build();
        subtitleConfigs.add(cfg);
      }
      itemBuilder.setSubtitleConfigurations(subtitleConfigs);
    }

    MediaItem item = itemBuilder.build();

    long posMs = (long) (startPos * 1000d);
    final String logUrl = url;
    final String logMime = mime;
    final long logPosMs = posMs;
    runOnUiThread(() -> {
      try {
        Log.i(TAG, "setSource: " + logUrl + " mime=" + (logMime != null ? logMime : "auto") + " start=" + logPosMs);
        if (trackSelector != null) {
          DefaultTrackSelector.Parameters.Builder builder2 = trackSelector.buildUponParameters();
          applyVideoConstraints(builder2);
          trackSelector.setParameters(builder2);
        }
        if (textureView != null) {
          try {
            player.clearVideoTextureView(textureView);
            player.setVideoTextureView(textureView);
          } catch (Exception ignored) {}
        }
        player.stop();
        player.clearMediaItems();
        player.setMediaItem(item, Math.max(posMs, 0));
        player.prepare();
      } catch (Exception e) {
        Log.e(TAG, "setSource failed", e);
        emitError(new PlaybackException("setSource failed", e, PlaybackException.ERROR_CODE_UNSPECIFIED));
      }
    });

    call.resolve();
  }

  @PluginMethod
  public void play(PluginCall call) {
    runOnUiThread(() -> {
      Log.i(TAG, "play");
      if (player != null) player.play();
    });
    call.resolve();
  }

  @PluginMethod
  public void pause(PluginCall call) {
    runOnUiThread(() -> {
      Log.i(TAG, "pause");
      if (player != null) player.pause();
    });
    call.resolve();
  }

  @PluginMethod
  public void seek(PluginCall call) {
    double pos = call.getDouble("position", 0d);
    long ms = (long) (pos * 1000d);
    runOnUiThread(() -> {
      Log.i(TAG, "seek: " + ms);
      if (player != null) player.seekTo(Math.max(ms, 0));
    });
    call.resolve();
  }

  @PluginMethod
  public void setVolume(PluginCall call) {
    double v = call.getDouble("volume", 1d);
    float vol = (float) Math.max(0, Math.min(1, v));
    runOnUiThread(() -> {
      if (player != null) player.setVolume(vol);
    });
    call.resolve();
  }

  @PluginMethod
  public void setPlaybackRate(PluginCall call) {
    double rate = call.getDouble("rate", 1d);
    runOnUiThread(() -> {
      if (player != null) player.setPlaybackSpeed((float) rate);
    });
    call.resolve();
  }

  @PluginMethod
  public void setAudioTrack(PluginCall call) {
    int idx = call.getInt("index", -1);
    if (idx < 0 || idx >= audioRefs.size() || trackSelector == null) {
      call.resolve();
      return;
    }

    TrackRef ref = audioRefs.get(idx);
    TrackSelectionOverride override = new TrackSelectionOverride(ref.group.getMediaTrackGroup(), ImmutableList.of(ref.trackIndex));

    DefaultTrackSelector.Parameters.Builder builder = trackSelector.buildUponParameters();
    builder.clearOverridesOfType(C.TRACK_TYPE_AUDIO);
    builder.addOverride(override);
    trackSelector.setParameters(builder);

    call.resolve();
  }

  @PluginMethod
  public void setTextTrack(PluginCall call) {
    String raw = call.getString("index");
    if (trackSelector == null) {
      call.resolve();
      return;
    }

    if (raw == null || "off".equals(raw)) {
      DefaultTrackSelector.Parameters.Builder builder = trackSelector.buildUponParameters();
      builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
      trackSelector.setParameters(builder);
      call.resolve();
      return;
    }

    int idx = call.getInt("index", -1);
    if (idx < 0 || idx >= textRefs.size()) {
      call.resolve();
      return;
    }

    TrackRef ref = textRefs.get(idx);
    TrackSelectionOverride override = new TrackSelectionOverride(ref.group.getMediaTrackGroup(), ImmutableList.of(ref.trackIndex));

    DefaultTrackSelector.Parameters.Builder builder = trackSelector.buildUponParameters();
    builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false);
    builder.clearOverridesOfType(C.TRACK_TYPE_TEXT);
    builder.addOverride(override);
    trackSelector.setParameters(builder);

    call.resolve();
  }

  @PluginMethod
  public void destroy(PluginCall call) {
    runOnUiThread(() -> {
      stopTimeLoop();
      try {
        if (parentRef != null && webLayoutListener != null) {
          parentRef.removeOnLayoutChangeListener(webLayoutListener);
        }
      } catch (Exception ignored) {}
      webLayoutListener = null;
      webViewRef = null;
      parentRef = null;
      if (textureView != null) {
        ViewGroup parent = (ViewGroup) textureView.getParent();
        if (parent != null) parent.removeView(textureView);
        textureView = null;
      }
      if (player != null) {
        try {
          if (textureView != null) {
            player.clearVideoTextureView(textureView);
          }
        } catch (Exception ignored) {}
        player.release();
        player = null;
      }
      Log.i(TAG, "destroy");
    });
    call.resolve();
  }

  @PluginMethod
  public void setVideoOffset(PluginCall call) {
    double v = call.getDouble("offsetY", 0d);
    manualOffsetY = (float) v;
    runOnUiThread(this::applyTextureTransform);
    call.resolve();
  }
}
