package app.frank.think;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private static final String OFFLINE_HTML = "<!DOCTYPE html>" +
        "<html lang=\"en\">" +
        "<head>" +
        "<meta charset=\"UTF-8\">" +
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, viewport-fit=cover\">" +
        "<title>Network Unavailable — FRANK Think</title>" +
        "<style>" +
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;margin:0;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#0b0f19;color:#f8fafc;text-align:center;box-sizing:border-box;}" +
        ".icon-card{width:88px;height:88px;border-radius:24px;background:rgba(37,99,235,0.12);display:flex;align-items:center;justify-content:center;margin-bottom:24px;border:1px solid rgba(37,99,235,0.25);box-shadow:0 12px 30px rgba(0,0,0,0.3);}" +
        "h1{font-size:22px;margin:0 0 10px 0;font-weight:800;letter-spacing:-0.5px;}" +
        "p{font-size:14px;color:#94a3b8;line-height:1.6;margin:0 0 32px 0;max-width:340px;}" +
        ".retry-button{background:#2563eb;color:#ffffff;border:none;border-radius:14px;padding:15px 36px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(37,99,235,0.4);display:inline-flex;align-items:center;gap:10px;text-decoration:none;-webkit-tap-highlight-color:transparent;}" +
        ".retry-button:active{transform:scale(0.97);filter:brightness(0.95);}" +
        "</style>" +
        "</head>" +
        "<body>" +
        "<div class=\"icon-card\">" +
        "<svg width=\"44\" height=\"44\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#3b82f6\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line><path d=\"M16.72 11.06A10.94 10.94 0 0 1 19 12.55\"></path><path d=\"M5 12.55a10.94 10.94 0 0 1 5.17-2.39\"></path><path d=\"M10.71 5.05A16 16 0 0 1 22.56 9\"></path><path d=\"M1.42 9a15.91 15.91 0 0 1 4.7-2.88\"></path><path d=\"M8.53 16.11a6 6 0 0 1 6.95 0\"></path><line x1=\"12\" y1=\"20\" x2=\"12.01\" y2=\"20\"></line></svg>" +
        "</div>" +
        "<h1>Network Unavailable</h1>" +
        "<p>FRANK Think requires an active internet connection to load and securely sync your chats and documents.</p>" +
        "<button class=\"retry-button\" onclick=\"window.location.href='https://fnk.vercel.app/'\">" +
        "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"23 4 23 10 17 10\"></polyline><path d=\"M20.49 15a9 9 0 1 1-2.12-9.36L23 10\"></path></svg>" +
        "<span>Retry Connection</span>" +
        "</button>" +
        "</body>" +
        "</html>";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        this.getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onReceivedError(WebView webView) {
                webView.loadDataWithBaseURL("https://fnk.vercel.app/", OFFLINE_HTML, "text/html", "UTF-8", null);
            }
        });
    }
}
