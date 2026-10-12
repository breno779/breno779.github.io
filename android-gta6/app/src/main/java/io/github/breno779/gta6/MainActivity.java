package io.github.breno779.gta6;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageInfo;
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

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * App "GTA VI — Contagem": abre o contador (gta6.html) do site num WebView próprio.
 * Também: oferece fixar o widget na tela inicial, e tem atualização automática
 * (checa uma versão nova no GitHub e instala com 1 toque, sem abrir o navegador).
 */
public class MainActivity extends Activity {

    private static final String HOST = "breno779.github.io";
    private static final String HOME = "https://" + HOST + "/gta6.html";

    private static final String REL =
        "https://github.com/breno779/breno779.github.io/releases/download/gta6-apk-latest/";
    private static final String VERSION_URL = REL + "gta6-version.json";
    private static final String APK_FALLBACK = REL + "gta6-contagem.apk";

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
            web.postDelayed(this::maybePromptPinWidget, 1200);
            checkForUpdate(false); // checa atualização silenciosamente ao abrir
        }
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

    // ---------------- Atualização automática ----------------

    private long currentVersionCode() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    /** Checa o version.json no GitHub. manual=true mostra aviso mesmo quando já está atualizado. */
    private void checkForUpdate(final boolean manual) {
        new Thread(() -> {
            try {
                String body = httpGet(VERSION_URL);
                JSONObject j = new JSONObject(body);
                final long remote = j.optLong("versionCode", 0);
                final String apk = j.optString("apk", APK_FALLBACK);
                if (remote > currentVersionCode()) {
                    runOnUiThread(() -> promptUpdate(apk));
                } else if (manual) {
                    runOnUiThread(() -> Toast.makeText(this, "Você já está na versão mais recente ✓", Toast.LENGTH_SHORT).show());
                }
            } catch (Exception e) {
                if (manual) runOnUiThread(() -> Toast.makeText(this, "Não deu pra checar atualização agora.", Toast.LENGTH_SHORT).show());
            }
        }).start();
    }

    private void promptUpdate(final String apkUrl) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
            .setTitle("Atualização disponível 🎮")
            .setMessage("Tem uma versão nova do app GTA VI Contagem. Quer atualizar agora?")
            .setPositiveButton("Atualizar", (d, w) -> downloadAndInstall(apkUrl))
            .setNegativeButton("Agora não", null)
            .show();
    }

    private void downloadAndInstall(final String apkUrl) {
        Toast.makeText(this, "Baixando atualização…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try {
                File dir = new File(getCacheDir(), "updates");
                dir.mkdirs();
                File apk = new File(dir, "gta6-contagem.apk");
                downloadTo(apkUrl, apk);
                Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", apk);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                runOnUiThread(() -> {
                    try {
                        startActivity(i);
                    } catch (Exception e) {
                        Toast.makeText(this, "Não consegui abrir o instalador.", Toast.LENGTH_LONG).show();
                    }
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "Falha ao baixar a atualização.", Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    private static String httpGet(String url) throws Exception {
        HttpURLConnection c = open(url);
        try (InputStream is = c.getInputStream()) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    private static void downloadTo(String url, File out) throws Exception {
        HttpURLConnection c = open(url);
        try (InputStream is = c.getInputStream(); FileOutputStream os = new FileOutputStream(out)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
        } finally {
            c.disconnect();
        }
    }

    /** Abre a conexão seguindo redirecionamentos, inclusive https->https entre hosts (GitHub). */
    private static HttpURLConnection open(String url) throws Exception {
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "GTA6Contagem");
            int code = c.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM || code == HttpURLConnection.HTTP_MOVED_TEMP
                    || code == HttpURLConnection.HTTP_SEE_OTHER || code == 307 || code == 308) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new Exception("redirect sem Location");
                url = loc;
                continue;
            }
            return c;
        }
        throw new Exception("redirecionamentos demais");
    }

    /** Ponte JS -> Android. */
    private class WidgetBridge {
        @JavascriptInterface
        public void pinWidget() {
            runOnUiThread(MainActivity.this::maybePromptPinWidget);
        }

        @JavascriptInterface
        public void checkUpdate() {
            runOnUiThread(() -> checkForUpdate(true));
        }
    }
}
