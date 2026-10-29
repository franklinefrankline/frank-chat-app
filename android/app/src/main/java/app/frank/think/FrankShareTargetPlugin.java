package app.frank.think;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.webkit.MimeTypeMap;
import android.webkit.WebView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@CapacitorPlugin(name = "FrankShareTarget")
public class FrankShareTargetPlugin extends Plugin {
    private static final String TAG = "FrankShareTarget";
    private static JSObject pendingShareData = null;
    private static FrankShareTargetPlugin activeInstance = null;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
        Log.d(TAG, "FrankShareTargetPlugin initialized");
        if (pendingShareData != null) {
            notifyListeners("filesShared", pendingShareData);
        }
    }

    @PluginMethod
    public void getSharedFiles(PluginCall call) {
        if (pendingShareData != null) {
            call.resolve(pendingShareData);
        } else {
            JSObject res = new JSObject();
            res.put("hasFiles", false);
            res.put("files", new JSArray());
            res.put("caption", "");
            call.resolve(res);
        }
    }

    @PluginMethod
    public void clearSharedFiles(PluginCall call) {
        pendingShareData = null;
        JSObject res = new JSObject();
        res.put("cleared", true);
        call.resolve(res);
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        String filename = call.getString("filename", "Spreadsheet.xlsx");
        String base64Data = call.getString("base64Data", "");
        String mimeType = call.getString("mimeType", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("base64Data is required");
            return;
        }

        try {
            if (base64Data.contains(",")) {
                base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
            }
            byte[] fileBytes = Base64.decode(base64Data, Base64.DEFAULT);

            Context context = getContext();
            File downloadsDir = context.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS);
            if (downloadsDir == null) {
                downloadsDir = context.getCacheDir();
            }
            File outFile = new File(downloadsDir, filename);
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(fileBytes);
                fos.flush();
            }

            Uri contentUri = androidx.core.content.FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                outFile
            );

            Intent sendIntent = new Intent(Intent.ACTION_SEND);
            sendIntent.setType(mimeType);
            sendIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            sendIntent.putExtra(Intent.EXTRA_SUBJECT, filename);
            sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(sendIntent, "Save or Open " + filename);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            context.startActivity(chooser);

            JSObject res = new JSObject();
            res.put("success", true);
            res.put("filename", filename);
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "Failed downloading/saving file: " + filename, e);
            call.reject("Download failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void printDocument(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (printManager != null && webView != null) {
                    String jobName = "FRANK_Spreadsheet_" + System.currentTimeMillis();
                    PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(jobName);
                    printManager.print(jobName, printAdapter, new PrintAttributes.Builder().build());
                    JSObject res = new JSObject();
                    res.put("success", true);
                    call.resolve(res);
                } else {
                    call.reject("Print service unavailable");
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed printing document", e);
                call.reject("Print failed: " + e.getMessage());
            }
        });
    }

    public static synchronized boolean handleShareIntent(Context context, Intent intent) {
        if (intent == null) return false;

        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return false;
        }

        Log.i(TAG, "Handling share intent action: " + action);

        String mimeType = intent.getType();
        String extraText = intent.getStringExtra(Intent.EXTRA_TEXT);
        String extraSubject = intent.getStringExtra(Intent.EXTRA_SUBJECT);

        String caption = "";
        if (extraText != null && !extraText.trim().isEmpty()) {
            caption = extraText.trim();
        } else if (extraSubject != null && !extraSubject.trim().isEmpty()) {
            caption = extraSubject.trim();
        }

        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri streamUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (streamUri != null) {
                uris.add(streamUri);
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> streamUris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streamUris != null) {
                uris.addAll(streamUris);
            }
        }

        JSArray filesArray = new JSArray();
        for (Uri uri : uris) {
            JSObject fileObj = processUri(context, uri, mimeType);
            if (fileObj != null) {
                filesArray.put(fileObj);
            }
        }

        if (filesArray.length() == 0 && caption.isEmpty()) {
            Log.w(TAG, "Share intent contained neither valid files nor caption");
            return false;
        }

        JSObject result = new JSObject();
        result.put("hasFiles", filesArray.length() > 0);
        result.put("action", action);
        result.put("caption", caption);
        result.put("files", filesArray);
        result.put("timestamp", System.currentTimeMillis());

        pendingShareData = result;

        if (activeInstance != null) {
            activeInstance.notifyListeners("filesShared", result);
        }

        return true;
    }

    private static JSObject processUri(Context context, Uri uri, String defaultMimeType) {
        if (uri == null) return null;
        ContentResolver resolver = context.getContentResolver();

        String displayName = null;
        long size = -1;
        try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex != -1) {
                    displayName = cursor.getString(nameIndex);
                }
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (sizeIndex != -1) {
                    size = cursor.getLong(sizeIndex);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed resolving metadata for " + uri, e);
        }

        String detectedMime = resolver.getType(uri);
        if (detectedMime == null || detectedMime.isEmpty() || "*/*".equals(detectedMime)) {
            detectedMime = defaultMimeType;
        }
        if (detectedMime == null || detectedMime.isEmpty() || "*/*".equals(detectedMime)) {
            if (displayName != null) {
                String ext = MimeTypeMap.getFileExtensionFromUrl(displayName);
                if (ext != null && !ext.isEmpty()) {
                    detectedMime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
                }
            }
        }
        if (detectedMime == null || detectedMime.isEmpty()) {
            detectedMime = "application/octet-stream";
        }

        if (displayName == null || displayName.trim().isEmpty()) {
            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(detectedMime);
            if (ext == null || ext.isEmpty()) {
                if (detectedMime.startsWith("image/")) ext = "jpg";
                else if (detectedMime.startsWith("video/")) ext = "mp4";
                else if (detectedMime.startsWith("audio/")) ext = "mp3";
                else if (detectedMime.contains("pdf")) ext = "pdf";
                else ext = "bin";
            }
            displayName = "shared_" + System.currentTimeMillis() + "." + ext;
        }

        File cacheDir = new File(context.getCacheDir(), "shared_incoming");
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }
        cleanOldCacheFiles(cacheDir);

        String safeName = displayName.replaceAll("[^a-zA-Z0-9._-]", "_");
        File destFile = new File(cacheDir, UUID.randomUUID().toString().substring(0, 8) + "_" + safeName);

        ByteArrayOutputStream byteBuffer = new ByteArrayOutputStream();
        long totalCopied = 0;
        try (InputStream is = resolver.openInputStream(uri);
             FileOutputStream fos = new FileOutputStream(destFile)) {
            if (is == null) {
                Log.e(TAG, "Cannot open stream for URI: " + uri);
                return null;
            }
            byte[] buf = new byte[8192];
            int read;
            while ((read = is.read(buf)) != -1) {
                fos.write(buf, 0, read);
                if (totalCopied < 35 * 1024 * 1024) {
                    byteBuffer.write(buf, 0, read);
                }
                totalCopied += read;
            }
            fos.flush();
        } catch (Exception e) {
            Log.e(TAG, "Failed reading URI " + uri, e);
            return null;
        }

        if (size <= 0) {
            size = totalCopied;
        }

        String dataUrl = "";
        if (totalCopied <= 35 * 1024 * 1024) {
            String b64 = Base64.encodeToString(byteBuffer.toByteArray(), Base64.NO_WRAP);
            dataUrl = "data:" + detectedMime + ";base64," + b64;
        }

        JSObject obj = new JSObject();
        obj.put("name", displayName);
        obj.put("mimeType", detectedMime);
        obj.put("size", size);
        obj.put("path", destFile.getAbsolutePath());
        obj.put("dataUrl", dataUrl);
        return obj;
    }

    private static void cleanOldCacheFiles(File dir) {
        try {
            if (dir == null || !dir.exists() || !dir.isDirectory()) return;
            long now = System.currentTimeMillis();
            long maxAge = 2 * 60 * 60 * 1000L; // 2 hours
            File[] files = dir.listFiles();
            if (files != null) {
                for (File f : files) {
                    if (now - f.lastModified() > maxAge) {
                        f.delete();
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    public static void notifyWebViewIfPending(WebView webView) {
        if (webView == null || pendingShareData == null) return;
        try {
            String jsonStr = pendingShareData.toString();
            String b64Json = Base64.encodeToString(jsonStr.getBytes("UTF-8"), Base64.NO_WRAP);
            String script = "(function(){try{" +
                "var raw = decodeURIComponent(escape(atob('" + b64Json + "')));" +
                "var data = JSON.parse(raw);" +
                "window.frankPendingSharedFiles = data;" +
                "window.dispatchEvent(new CustomEvent('frank:filesShared', {detail: data}));" +
                "}catch(e){console.error('Error dispatching shared files:', e);}})();";
            webView.post(() -> webView.evaluateJavascript(script, null));
        } catch (Exception e) {
            Log.e(TAG, "Failed notifying webview of shared files", e);
        }
    }
}

