package io.github.breno779.ucm;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Collections;

/**
 * App Android da UCM Watchlist: abre o site (breno779.github.io) num WebView próprio.
 * Não depende do Chrome estar acordado (usa o WebView do sistema), guarda os dados dentro
 * do próprio app, salva backups/planilhas/calendário na pasta Downloads e abre links de
 * fora (trailer do YouTube etc.) no app certo.
 */
public class MainActivity extends Activity {

    private static final String HOST = "breno779.github.io";
    private static final String HOME = "https://" + HOST + "/";
    private static final int FILE_CHOOSER = 42;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    // Faz os downloads (blob:) do site virarem arquivos de verdade — em TODAS as janelas
    // (o app de sempre roda dentro de um iframe).
    private static final String PATCH_JS =
        "(function(){" +
        " function patch(w){ try{ if(!w||w.__ucmPatched)return; w.__ucmPatched=true;" +
        "  var orig=w.HTMLAnchorElement.prototype.click;" +
        "  w.HTMLAnchorElement.prototype.click=function(){" +
        "   var a=this; if(a.download&&a.href&&(a.href.indexOf('blob:')===0||a.href.indexOf('data:')===0)){" +
        "    w.fetch(a.href).then(function(r){return r.blob();}).then(function(b){var fr=new w.FileReader();" +
        "     fr.onload=function(){var s=fr.result;var i=s.indexOf(',');" +
        "      (w.UCMApp||window.UCMApp).saveFile(a.download, b.type||'application/octet-stream', s.slice(i+1));};" +
        "     fr.readAsDataURL(b);});" +
        "    return; }" +
        "   return orig.call(this); };" +
        "  w.addEventListener('load',function(){ try{ var fs=w.document.querySelectorAll('iframe'); for(var k=0;k<fs.length;k++){ patch(fs[k].contentWindow); fs[k].addEventListener('load',function(e){patch(e.target.contentWindow);}); } }catch(e){} });" +
        " }catch(e){} }" +
        " patch(window);" +
        " try{ var fs=document.querySelectorAll('iframe'); for(var k=0;k<fs.length;k++){ patch(fs[k].contentWindow); fs[k].addEventListener('load',function(e){patch(e.target.contentWindow);}); } }catch(e){}" +
        "})();";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#15141B"));
        getWindow().setNavigationBarColor(Color.parseColor("#15141B"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#15141B"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " UCMWatchlistApp/40");

        web.addJavascriptInterface(new Bridge(), "UCMApp");
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, PATCH_JS, Collections.singleton("https://" + HOST));
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (u == null) return false;
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if ((scheme.equals("https") || scheme.equals("http")) && HOST.equals(u.getHost())) return false;
                openExternal(u);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(PATCH_JS, null);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(Intent.createChooser(i, "Escolher arquivo"), FILE_CHOOSER);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(urlFromIntent(getIntent()));
        }
    }

    // ucmwatchlist://open/beta/?a=liga  ->  https://breno779.github.io/beta/?a=liga
    private String urlFromIntent(Intent intent) {
        Uri d = intent == null ? null : intent.getData();
        if (d != null && "ucmwatchlist".equals(d.getScheme())) {
            String path = d.getPath() == null ? "/" : d.getPath();
            String q = d.getQuery();
            return "https://" + HOST + path + (q != null ? "?" + q : "");
        }
        return HOME;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getData() != null) web.loadUrl(urlFromIntent(intent));
    }

    private void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Não achei um app pra abrir esse link", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER) {
            if (fileCallback != null) {
                Uri[] res = null;
                if (resultCode == RESULT_OK && data != null && data.getData() != null) res = new Uri[]{data.getData()};
                fileCallback.onReceiveValue(res);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
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

    /** Ponte JS -> Android: salva arquivos (backup, CSV, calendário, imagem) em Downloads. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String base64) {
            runOnUiThread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    String safe = (name == null || name.isEmpty()) ? "ucm-arquivo" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
                    Uri saved = null;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues v = new ContentValues();
                        v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                        v.put(MediaStore.Downloads.MIME_TYPE, mime);
                        v.put(MediaStore.Downloads.IS_PENDING, 1);
                        ContentResolver cr = getContentResolver();
                        saved = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                        if (saved == null) throw new Exception("sem acesso a Downloads");
                        try (OutputStream os = cr.openOutputStream(saved)) { os.write(bytes); }
                        v.clear();
                        v.put(MediaStore.Downloads.IS_PENDING, 0);
                        cr.update(saved, v, null, null);
                    } else {
                        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                        File f = new File(dir, safe);
                        try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                    }
                    Toast.makeText(MainActivity.this, "Salvo em Downloads: " + safe, Toast.LENGTH_LONG).show();
                    // calendário: já oferece abrir no app de agenda
                    if (saved != null && mime != null && mime.startsWith("text/calendar")) {
                        Intent i = new Intent(Intent.ACTION_VIEW);
                        i.setDataAndType(saved, "text/calendar");
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        try { startActivity(i); } catch (ActivityNotFoundException ignored) { }
                    }
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Não deu pra salvar: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public String version() { return "40.0-beta"; }
    }
}
