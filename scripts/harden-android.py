#!/usr/bin/env python3
"""Run after `npx cap add android`. Makes sure the APK asks for NO storage permission and keeps data inside the app:
 - removes storage permissions that plugins may add (tools:node="remove")
 - turns off Android cloud/device backup of the app's data (allowBackup=false)
Idempotent."""
import pathlib, re, sys

manifest = pathlib.Path(__file__).resolve().parent.parent / 'android/app/src/main/AndroidManifest.xml'
if not manifest.exists():
    sys.exit('android/ project not found. Run: npx cap add android')
m = manifest.read_text(encoding='utf-8')

if 'xmlns:tools=' not in m:
    m = m.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ', 1)
for perm in ('READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'MANAGE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_AUDIO'):
    if f'android.permission.{perm}"' not in m:
        m = m.replace('<application', f'<uses-permission android:name="android.permission.{perm}" tools:node="remove" />\n    <application', 1)
m = re.sub(r'android:allowBackup="[^"]*"', 'android:allowBackup="false"', m)
if 'android:allowBackup' not in m:
    m = m.replace('<application', '<application android:allowBackup="false"', 1)
manifest.write_text(m, encoding='utf-8')
print(m)
