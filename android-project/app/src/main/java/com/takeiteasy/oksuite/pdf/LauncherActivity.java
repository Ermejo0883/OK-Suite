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

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private LocalPdfServer localPdfServer;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
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

        // Se l'intent è ACTION_VIEW con un PDF, servi il file via localhost
        String action = getIntent().getAction();
        Uri dataUri = getIntent().getData();

        if (Intent.ACTION_VIEW.equals(action) && dataUri != null) {
            String mimeType = getIntent().getType();
            if (mimeType == null) {
                mimeType = getContentResolver().getType(dataUri);
            }
            boolean isPdf = "application/pdf".equals(mimeType)
                    || (dataUri.getLastPathSegment() != null
                        && dataUri.getLastPathSegment().toLowerCase().endsWith(".pdf"));
            if (isPdf) {
                try {
                    // Legge i byte del PDF tramite ContentResolver
                    InputStream is = getContentResolver().openInputStream(dataUri);
                    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                    byte[] chunk = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = is.read(chunk)) != -1) {
                        buffer.write(chunk, 0, bytesRead);
                    }
                    is.close();
                    byte[] pdfBytes = buffer.toByteArray();

                    // Avvia un server HTTP locale e passa l'URL localhost al web
                    localPdfServer = new LocalPdfServer(pdfBytes);
                    localPdfServer.start();
                    int port = localPdfServer.getPort();
                    uri = uri.buildUpon()
                            .appendQueryParameter("file", "http://localhost:" + port + "/file.pdf")
                            .build();
                } catch (Exception e) {
                    // Fallback: passa l'URI content:// direttamente (potrebbe non funzionare)
                    grantUriPermission("com.android.chrome",
                            dataUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    uri = uri.buildUpon()
                            .appendQueryParameter("file", dataUri.toString())
                            .build();
                }
            }
        }

        return uri;
    }
}
