package io.github.breno779.gta6;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * App "GTA VI — Contagem": abre o contador (gta6.html) do site num WebView próprio.
 * Links externos (compartilhar, calendário, etc.) vão para o app certo do Android.
 */
public class MainActivity extends Activity {

    private static final String HOST = "breno779.github.io";
    private static final String HOME = "https://" + HOST + "/gta6.html";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#120018"));
        getWindow().setNavigationBarColor(Color.parseColor("#120018"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#120018"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.addJavascriptInterface(new WidgetBridge(), "GTA6App");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (u == null) return false;
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if ((scheme.equals("https") || scheme.equals("http")) && HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "Não achei um app pra abrir esse link", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(HOME);
            // Logo ao abrir, se ainda não houver widget na tela, oferece fixar um
            // (o Android exige essa confirmação — nenhum app põe widget sozinho).
            web.postDelayed(this::maybePromptPinWidget, 1200);
        }
    }

    /** Oferece fixar o widget na tela inicial, mas só se ainda não houver nenhum. */
    private void maybePromptPinWidget() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        AppWidgetManager awm = getSystemService(AppWidgetManager.class);
        if (awm == null || !awm.isRequestPinAppWidgetSupported()) return;
        ComponentName cn = new ComponentName(this, Gta6Widget.class);
        int[] ids = awm.getAppWidgetIds(cn);
        if (ids != null && ids.length > 0) return; // já tem widget, não incomoda
        try {
            awm.requestPinAppWidget(cn, null, null);
        } catch (Exception ignored) { }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    /** Ponte JS -> Android: pede ao sistema pra fixar o widget na tela inicial (1 toque). */
    private class WidgetBridge {
        @JavascriptInterface
        public void pinWidget() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    AppWidgetManager awm = getSystemService(AppWidgetManager.class);
                    ComponentName cn = new ComponentName(MainActivity.this, Gta6Widget.class);
                    if (awm != null && awm.isRequestPinAppWidgetSupported()) {
                        awm.requestPinAppWidget(cn, null, null);
                        return;
                    }
                }
                Toast.makeText(MainActivity.this,
                    "Seu lançador não deixa fixar automático. Segure num espaço vazio da tela inicial ▸ Widgets ▸ GTA VI Contagem.",
                    Toast.LENGTH_LONG).show();
            });
        }
    }
}
