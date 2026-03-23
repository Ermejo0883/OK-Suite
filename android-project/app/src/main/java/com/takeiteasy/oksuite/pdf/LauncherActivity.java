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



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    

    

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
    protected Uri getLaunchingUrl() {
        Uri uri = super.getLaunchingUrl();

        // Se l'intent è ACTION_VIEW con un PDF, passa l'URI al web tramite ?file=
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
                // Concede l'accesso al contenuto a Chrome
                grantUriPermission("com.android.chrome",
                        dataUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                uri = uri.buildUpon()
                        .appendQueryParameter("file", dataUri.toString())
                        .build();
            }
        }

        return uri;
    }
}
