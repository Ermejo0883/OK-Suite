/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.takeiteasy.oksuite.pdf;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final String TAG = "OKPdf";
    private LocalPdfServer localPdfServer;
    private int localPdfPort = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Legge il PDF PRIMA di super.onCreate() che chiama getLaunchingUrl()
        Intent intent = getIntent();
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            initLocalPdfServer(intent.getData(), intent.getType());
        }

        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    private void initLocalPdfServer(Uri dataUri, String mimeType) {
        try {
            if (mimeType == null) {
                mimeType = getContentResolver().getType(dataUri);
            }
            boolean isPdf = "application/pdf".equals(mimeType)
                    || (dataUri.getLastPathSegment() != null
                        && dataUri.getLastPathSegment().toLowerCase().endsWith(".pdf"));
            if (!isPdf) {
                Log.w(TAG, "initLocalPdfServer: non è un PDF, mimeType=" + mimeType);
                return;
            }

            Log.i(TAG, "initLocalPdfServer: lettura da " + dataUri);
            InputStream is = getContentResolver().openInputStream(dataUri);
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int bytesRead;
            while ((bytesRead = is.read(chunk)) != -1) {
                buffer.write(chunk, 0, bytesRead);
            }
            is.close();
            byte[] pdfBytes = buffer.toByteArray();
            Log.i(TAG, "initLocalPdfServer: letti " + pdfBytes.length + " byte");

            localPdfServer = new LocalPdfServer(pdfBytes);
            localPdfServer.start();
            localPdfPort = localPdfServer.getPort();
            Log.i(TAG, "initLocalPdfServer: server avviato su porta " + localPdfPort);

        } catch (Exception e) {
            Log.e(TAG, "initLocalPdfServer ERRORE: " + e.getClass().getSimpleName() + ": " + e.getMessage(), e);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (localPdfServer != null) {
            localPdfServer.stop();
            localPdfServer = null;
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri uri = super.getLaunchingUrl();

        if (localPdfPort > 0) {
            // Server avviato: usa URL localhost fetchabile da Chrome
            String localUrl = "http://localhost:" + localPdfPort + "/file.pdf";
            Log.i(TAG, "getLaunchingUrl: uso localhost -> " + localUrl);
            return uri.buildUpon()
                    .appendQueryParameter("file", localUrl)
                    .build();
        }

        // Fallback: passa content:// (non funzionerà, ma almeno logghiamo)
        String action = getIntent().getAction();
        Uri dataUri = getIntent().getData();
        if (Intent.ACTION_VIEW.equals(action) && dataUri != null) {
            Log.w(TAG, "getLaunchingUrl: fallback a content:// " + dataUri);
            grantUriPermission("com.android.chrome",
                    dataUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return uri.buildUpon()
                    .appendQueryParameter("file", dataUri.toString())
                    .build();
        }

        return uri;
    }
}
