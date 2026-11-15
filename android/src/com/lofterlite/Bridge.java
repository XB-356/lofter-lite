package com.lofterlite;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * 网页与原生之间的桥：
 * - http：带 Cookie 的通用请求（绕开浏览器 CORS，共享 WebView 登录态）
 * - 登录 / 登出 / 打开链接 / 状态栏配色
 */
public class Bridge {
    private static final String CHUNK = "75000";
    private static final int CHUNK_SIZE = 75000;
    private final Activity activity;
    private final WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    Bridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
    }

    @JavascriptInterface
    public void http(final String id, final String url, final String method,
                     final String body, final String headersJson) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                int status = -1;
                String text = "";
                try {
                    HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setRequestMethod(method == null || method.isEmpty() ? "GET" : method);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(25000);
                    conn.setInstanceFollowRedirects(true);
                    conn.setRequestProperty("User-Agent",
                            "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36");
                    conn.setRequestProperty("Accept", "*/*");

                    String cookie = mergedCookie(url);
                    if (cookie != null && cookie.length() > 0) {
                        conn.setRequestProperty("Cookie", cookie);
                    }

                    if (headersJson != null && headersJson.length() > 0) {
                        JSONObject h = new JSONObject(headersJson);
                        Iterator<String> it = h.keys();
                        while (it.hasNext()) {
                            String k = it.next();
                            String v = h.optString(k, "");
                            conn.setRequestProperty(k, v);
                        }
                    }

                    if (body != null && body.length() > 0) {
                        conn.setDoOutput(true);
                        conn.setRequestProperty("Content-Type",
                                "application/x-www-form-urlencoded; charset=utf-8");
                        OutputStream os = conn.getOutputStream();
                        os.write(body.getBytes("UTF-8"));
                        os.close();
                    }

                    status = conn.getResponseCode();
                    InputStream is = (status >= 400) ? conn.getErrorStream() : conn.getInputStream();
                    if (is == null) is = conn.getErrorStream();
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    if (is != null) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
                        is.close();
                    }
                    text = bos.toString("UTF-8");

                    // 让 WebView 记住响应里下发的 Cookie（登录态同步）
                    String setCookie = conn.getHeaderField("Set-Cookie");
                    if (setCookie != null) {
                        CookieManager.getInstance().setCookie(url, setCookie);
                    }
                } catch (Exception e) {
                    status = -1;
                    text = "{\"__error\":\"" + e.getClass().getSimpleName() + "\"}";
                }
                deliver(id, status, text);
            }
        });
    }

    // ---------------------------------------------------------------- 滑块验证
    // LOFTER 的写接口（点赞/关注/评论）被风控拦下时会回 meta.status=4071「请滑动滑块进行身份验证」。
    // 验证码走 captcha.lofter.com：GET /captcha/get?type=jigsaw 拿底图与拼图块，
    // 用户拖动滑块后 POST /captcha/check，请求体是 AES-CBC 加密的 {id,type,data:{xPos}}，
    // 头部 X-Encseckey 是 RSA 加密的 "key-iv"。过了之后原请求重发一次就能成功。
    private static final String CAPTCHA_URL = "https://captcha.lofter.com";
    private static final String CAPTCHA_RSA_PUBLIC_KEY =
            "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAm4re9B8pjX71Up+b97dvV41bEvNTD0e7aaMyPr8FTHkINSrrGqXjz4pQ6x8AbioULXYIrzcMO3LyXolLcjE/+0Ubx8KMu30CS2D7TVHEkaZKqz5EKOgWFeepAL6++klyjXO+vVWSDjb8R6g1VoQKh9MPxLJGqXoFOh9cDahdDRLH1M4a8XboWwljx4CM+vHAuDAwY7i3R4E+bsE+GW5LI7zt/rnTF4tnt0CFazl65SiXthyPJglwCZOF2SLs8JJCrknVoWeDyGBMmQ/0gghK4VMAyFcxHCs8y4v7HtOEsRvS4fksSzLSpyNkhGGuNKHk5tBm5L5m6vApmvUYP6QSdwIDAQAB";

    private static final String ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

    private static String randomKey(int len) {
        Random r = new Random();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < len; i++) sb.append(ALNUM.charAt(r.nextInt(ALNUM.length())));
        return sb.toString();
    }

    /** 拉一张拼图验证码（返回上游 JSON 原文，含 data.id / data.bg / data.front） */
    @JavascriptInterface
    public void captchaGet(final String id) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                int status = -1;
                String text = "";
                try {
                    HttpURLConnection conn = (HttpURLConnection) new URL(CAPTCHA_URL + "/captcha/get?type=jigsaw").openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(20000);
                    conn.setRequestProperty("User-Agent", "LOFTER-Android 8.0.12 (23127PN0CC; Android 14; null) WIFI");
                    conn.setRequestProperty("Accept", "*/*");
                    status = conn.getResponseCode();
                    InputStream is = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    if (is != null) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
                        is.close();
                    }
                    text = bos.toString("UTF-8");
                } catch (Exception e) {
                    status = -1;
                    text = "{\"__error\":\"" + e.getClass().getSimpleName() + "\"}";
                }
                deliver(id, status, text);
            }
        });
    }

    /** 提交滑块位置（xPos 用底图原始像素坐标），成功后返回解密后的上游 JSON */
    @JavascriptInterface
    public void captchaCheck(final String id, final String challengeId, final int xPos) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                int status = -1;
                String text = "";
                String rawKey = randomKey(16);
                String rawIv = randomKey(16);
                try {
                    String plain = "{\"id\":\"" + challengeId + "\",\"type\":\"jigsaw\",\"data\":{\"xPos\":" + xPos + "}}";

                    // 1) AES-CBC/PKCS5 加密请求体
                    Cipher aes = Cipher.getInstance("AES/CBC/PKCS5Padding");
                    aes.init(Cipher.ENCRYPT_MODE,
                            new SecretKeySpec(rawKey.getBytes("UTF-8"), "AES"),
                            new IvParameterSpec(rawIv.getBytes("UTF-8")));
                    byte[] cipherBytes = aes.doFinal(plain.getBytes("UTF-8"));

                    // 2) RSA 公钥加密 "key-iv" 作为 X-Encseckey
                    byte[] pubBytes = android.util.Base64.decode(CAPTCHA_RSA_PUBLIC_KEY, android.util.Base64.DEFAULT);
                    PublicKey pub = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(pubBytes));
                    Cipher rsa = Cipher.getInstance("RSA/ECB/PKCS1Padding");
                    rsa.init(Cipher.ENCRYPT_MODE, pub);
                    String encseckey = android.util.Base64.encodeToString(
                            rsa.doFinal((rawKey + "-" + rawIv).getBytes("UTF-8")),
                            android.util.Base64.NO_WRAP);

                    HttpURLConnection conn = (HttpURLConnection) new URL(CAPTCHA_URL + "/captcha/check").openConnection();
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(20000);
                    conn.setRequestProperty("User-Agent", "LOFTER-Android 8.0.12 (23127PN0CC; Android 14; null) WIFI");
                    conn.setRequestProperty("Accept", "*/*");
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    conn.setRequestProperty("X-Encseckey", encseckey);
                    OutputStream os = conn.getOutputStream();
                    os.write(cipherBytes);
                    os.close();

                    status = conn.getResponseCode();
                    InputStream is = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    if (is != null) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
                        is.close();
                    }
                    byte[] respBytes = bos.toByteArray();

                    // 3) 响应也是 AES 加密的，用同一对 key/iv 解回来
                    try {
                        Cipher dec = Cipher.getInstance("AES/CBC/PKCS5Padding");
                        dec.init(Cipher.DECRYPT_MODE,
                                new SecretKeySpec(rawKey.getBytes("UTF-8"), "AES"),
                                new IvParameterSpec(rawIv.getBytes("UTF-8")));
                        text = new String(dec.doFinal(respBytes), "UTF-8");
                    } catch (Exception decryptErr) {
                        text = new String(respBytes, "UTF-8");
                    }
                } catch (Exception e) {
                    status = -1;
                    text = "{\"__error\":\"" + e.getClass().getSimpleName() + "\"}";
                }
                deliver(id, status, text);
            }
        });
    }

    /** 登录 Cookie 可能只落在 www.lofter.com，这里把多域名的 Cookie 合并后一起发给接口 */    private String mergedCookie(String url) {
        LinkedHashMap<String, String> map = new LinkedHashMap<>();
        addCookies(map, CookieManager.getInstance().getCookie(url));
        addCookies(map, CookieManager.getInstance().getCookie("https://www.lofter.com"));
        addCookies(map, CookieManager.getInstance().getCookie("https://api.lofter.com"));
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> e : map.entrySet()) {
            if (sb.length() > 0) sb.append("; ");
            sb.append(e.getKey()).append('=').append(e.getValue());
        }
        return sb.toString();
    }

    private void addCookies(Map<String, String> map, String raw) {
        if (raw == null || raw.length() == 0) return;
        for (String part : raw.split(";")) {
            String p = part.trim();
            if (p.length() == 0) continue;
            int eq = p.indexOf('=');
            if (eq <= 0) continue;
            String name = p.substring(0, eq);
            if (!map.containsKey(name)) map.put(name, p.substring(eq + 1));
        }
    }

    @JavascriptInterface
    public String cookieSummary() {
        try {
            String a = CookieManager.getInstance().getCookie("https://api.lofter.com");
            String w = CookieManager.getInstance().getCookie("https://www.lofter.com");
            return "api: " + cookieNames(a) + " | www: " + cookieNames(w);
        } catch (Exception e) {
            return "cookie 读取失败";
        }
    }

    private String cookieNames(String raw) {
        if (raw == null || raw.length() == 0) return "(空)";
        StringBuilder sb = new StringBuilder();
        for (String part : raw.split(";")) {
            int eq = part.indexOf('=');
            if (eq > 0) {
                if (sb.length() > 0) sb.append(',');
                sb.append(part.substring(0, eq).trim());
            }
        }
        return sb.length() == 0 ? "(空)" : sb.toString();
    }

    private void deliver(String id, int status, String body) {
        final String safeId = JSONObject.quote(id);
        int total = Math.max(1, (body.length() + CHUNK_SIZE - 1) / CHUNK_SIZE);
        for (int i = 0; i < total; i++) {
            int from = i * CHUNK_SIZE;
            int to = Math.min(body.length(), from + CHUNK_SIZE);
            String part = body.substring(from, to);
            final String js = "window.__nativeChunk&&window.__nativeChunk(" + safeId + ","
                    + i + "," + total + "," + JSONObject.quote(part) + ");";
            post(js);
        }
        post("window.__nativeDone&&window.__nativeDone(" + safeId + "," + status + ");");
    }

    private void post(final String js) {
        ui.post(new Runnable() {
            @Override
            public void run() {
                try { web.evaluateJavascript(js, null); } catch (Exception ignored) {}
            }
        });
    }

    @JavascriptInterface
    public boolean isLoggedIn() {
        try {
            // 实测 2026-11 登录后的 cookie 名是 LOFTER_SESS（不是 LOFTER_SESSION），
            // 且 api.lofter.com 与 www.lofter.com 两个域都要看，否则已登录也会判成未登录。
            final String[] hosts = { "https://www.lofter.com", "https://api.lofter.com" };
            final String[] marks = { "LOFTER_SESS", "LOFTER_SESSION", "p_uid", "LOFTER_UID", "lofter_uid" };
            for (int h = 0; h < hosts.length; h++) {
                String c = CookieManager.getInstance().getCookie(hosts[h]);
                if (c == null) continue;
                for (int m = 0; m < marks.length; m++) {
                    if (c.indexOf(marks[m]) >= 0) return true;
                }
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public void login() {
        ui.post(new Runnable() {
            @Override
            public void run() {
                if (activity instanceof MainActivity) ((MainActivity) activity).openLogin();
                else activity.startActivity(new Intent(activity, LoginActivity.class));
            }
        });
    }

    @JavascriptInterface
    public void relogin() {
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();
        ui.post(new Runnable() {
            @Override
            public void run() {
                if (activity instanceof MainActivity) ((MainActivity) activity).openLogin();
                else activity.startActivity(new Intent(activity, LoginActivity.class));
            }
        });
    }

    @JavascriptInterface
    public void logout() {
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();
        post("window.__loginChanged&&window.__loginChanged(false);");
    }

    @JavascriptInterface
    public void copy(final String text) {
        ui.post(new Runnable() {
            @Override
            public void run() {
                try {
                    ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                    cm.setPrimaryClip(ClipData.newPlainText("LofterLite", text));
                } catch (Exception e) { }
            }
        });
    }


    @JavascriptInterface
    public void openUrl(final String url) {
        ui.post(new Runnable() {
            @Override
            public void run() {
                try {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {}
            }
        });
    }

    @JavascriptInterface
    public void share(final String title, final String url) {
        ui.post(new Runnable() {
            @Override
            public void run() {
                try {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    String t = title == null ? "" : title;
                    i.putExtra(Intent.EXTRA_SUBJECT, t);
                    i.putExtra(Intent.EXTRA_TEXT, t.isEmpty() ? url : t + "\n" + url);
                    activity.startActivity(Intent.createChooser(i, "分享到"));
                } catch (Exception ignored) {}
            }
        });
    }

    @JavascriptInterface
    public void toast(final String msg) {
        ui.post(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    /** 跟随网页主题切换状态栏颜色 */
    @JavascriptInterface
    public void setDark(final boolean dark) {
        ui.post(new Runnable() {
            @Override
            public void run() {
                if (Build.VERSION.SDK_INT < 21) return;
                Window w = activity.getWindow();
                int color = dark ? Color.parseColor("#0E0F11") : Color.parseColor("#F4F4F6");
                w.setStatusBarColor(color);
                w.setNavigationBarColor(dark ? Color.parseColor("#0E0F11") : Color.WHITE);
                int flags = dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                w.getDecorView().setSystemUiVisibility(flags);
            }
        });
    }

    /** 把诊断 JSON 写到 Download/lofter-lite-diag.json，方便排查 */
    @JavascriptInterface
    public String writeDiag(final String json) {
        try {
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, "lofter-lite-diag.json");
            FileOutputStream fos = new FileOutputStream(f);
            fos.write(json.getBytes("UTF-8"));
            fos.close();
            return f.getAbsolutePath();
        } catch (Exception e) {
            try {
                File dir = activity.getExternalFilesDir(null);
                File f = new File(dir, "lofter-lite-diag.json");
                FileOutputStream fos = new FileOutputStream(f);
                fos.write(json.getBytes("UTF-8"));
                fos.close();
                return f.getAbsolutePath();
            } catch (Exception e2) {
                return "";
            }
        }
    }

    @JavascriptInterface
    public String platform() {
        return "android-apk";
    }
}
