package com.lofterlite;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 在应用内完成 LOFTER 登录。
 *
 * QQ 登录的关键：手机 UA 下 graph.qq.com 会尝试唤起 QQ App，授权后跳系统浏览器回不来；
 * 这里遇到 QQ 授权页时临时切到桌面 UA，让它显示「扫码登录」二维码，
 * 用户用手机 QQ 扫码后，回调会回到本 WebView，Cookie 直接落在本机。
 */
public class LoginActivity extends Activity {
    private static final String MOBILE_UA =
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
    private static final String DESKTOP_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    private WebView web;
    private volatile boolean polling = false;
    private volatile boolean finished = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setUserAgentString(MOBILE_UA);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onCloseWindow(WebView window) {
                // 页面里的 window.close() 不关掉登录页
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                // 把 window.open 的地址直接在当前 WebView 打开，避免弹出小窗丢失回调
                WebView temp = new WebView(LoginActivity.this);
                temp.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        loadSmart(url);
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(temp);
                resultMsg.sendToTarget();
                return true;
            }
        });

        FrameLayout.LayoutParams wlp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        wlp.topMargin = dp(46);
        root.addView(web, wlp);

        TextView hint = new TextView(this);
        hint.setText("手机 QQ 扫码授权后，点左上角「完成」返回");
        hint.setTextSize(12.5f);
        hint.setTextColor(Color.parseColor("#5F6066"));
        hint.setGravity(Gravity.CENTER);
        hint.setBackgroundColor(Color.parseColor("#FFF4F4F6"));
        hint.setLayoutParams(new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(46)));
        root.addView(hint);

        TextView doneBtn = new TextView(this);
        doneBtn.setText("完成");
        doneBtn.setTextSize(13);
        doneBtn.setTextColor(Color.parseColor("#10B3AA"));
        doneBtn.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams dlp = new FrameLayout.LayoutParams(dp(52), dp(44));
        dlp.gravity = Gravity.TOP | Gravity.LEFT;
        doneBtn.setLayoutParams(dlp);
        doneBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                CookieManager.getInstance().flush();
                finish();
            }
        });
        root.addView(doneBtn);

        TextView reload = new TextView(this);
        reload.setText("↻");
        reload.setTextSize(18);
        reload.setTextColor(Color.parseColor("#5F6066"));
        reload.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams rlp = new FrameLayout.LayoutParams(dp(44), dp(44));
        rlp.gravity = Gravity.TOP | Gravity.RIGHT;
        rlp.rightMargin = dp(44);
        reload.setLayoutParams(rlp);
        reload.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                web.getSettings().setUserAgentString(MOBILE_UA);
                web.reload();
            }
        });
        root.addView(reload);

        TextView close = new TextView(this);
        close.setText("✕");
        close.setTextSize(16);
        close.setTextColor(Color.parseColor("#5F6066"));
        close.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(44), dp(44));
        lp.gravity = Gravity.TOP | Gravity.RIGHT;
        close.setLayoutParams(lp);
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                CookieManager.getInstance().flush();
                finish();
            }
        });
        root.addView(close);

        setContentView(root);

        // 清掉上次残留，保证从标准登录表单开始
        try {
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();
            web.clearCache(true);
        } catch (Exception ignored) {}

        String startUrl = getIntent() != null ? getIntent().getStringExtra("url") : null;
        web.loadUrl(startUrl != null && startUrl.length() > 0 ? startUrl : "https://www.lofter.com/front/login");
        startPolling();
    }

    /** 扫码/密码登录完成后自动关闭，不用手动点完成 */
    private void startPolling() {
        if (polling) return;
        polling = true;
        new Thread(new Runnable() {
            @Override
            public void run() {
                for (int i = 0; i < 150 && !finished && !isFinishing(); i++) {
                    try { Thread.sleep(2000); } catch (InterruptedException e) { return; }
                    if (finished) return;
                    if (checkLoginState()) {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (finished) return;
                                finished = true;
                                CookieManager.getInstance().flush();
                                Toast.makeText(LoginActivity.this, "登录成功", Toast.LENGTH_SHORT).show();
                                finish();
                            }
                        });
                        return;
                    }
                }
            }
        }).start();
    }

    private boolean checkLoginState() {
        HttpURLConnection conn = null;
        try {
            URL u = new URL("https://api.lofter.com/v1.1/usercounts.api?product=lofter-android-8.3.50");
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestProperty("User-Agent", "LOFTER-Android 8.3.50 (V2272A; Android 13; null) WIFI");
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=utf-8");
            String cookie = CookieManager.getInstance().getCookie("https://api.lofter.com");
            if (cookie != null && cookie.length() > 0) conn.setRequestProperty("Cookie", cookie);
            conn.getOutputStream().close();
            InputStream is = conn.getInputStream();
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            is.close();
            return bos.toString("UTF-8").contains("\"status\":200");
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void loadSmart(String url) {
        if (url == null) return;
        if (isQqAuth(url)) {
            web.getSettings().setUserAgentString(DESKTOP_UA);
        } else if (url.contains("lofter.com")) {
            web.getSettings().setUserAgentString(MOBILE_UA);
        }
        web.loadUrl(url);
    }

    private boolean isQqAuth(String url) {
        return url.startsWith("https://graph.qq.com")
                || url.contains("ptlogin2.qq.com")
                || url.contains("xui.ptlogin2.qq.com");
    }

    /** 返回 true 表示已由本方法处理，不再交给 WebView 默认逻辑 */
    private boolean handleUrl(String url) {
        if (url == null) return true;

        // QQ 授权页：切桌面 UA，显示二维码，不唤起 QQ App
        if (isQqAuth(url)) {
            web.getSettings().setUserAgentString(DESKTOP_UA);
            web.loadUrl(url);
            return true;
        }
        // 回调页：恢复手机 UA，让 Cookie 落进来
        if (url.contains("accessQQCallBack") || url.contains("accessWeiXinCallBack")) {
            web.getSettings().setUserAgentString(MOBILE_UA);
            return false;
        }
        // mqqapi:// weixin:// 等一律不唤起外部 App，避免流程被带走
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            return true;
        }
        if (url.contains("lofter.com")) {
            web.getSettings().setUserAgentString(MOBILE_UA);
        }
        return false;
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    @Override
    protected void onDestroy() {
        finished = true;
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        CookieManager.getInstance().flush();
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
