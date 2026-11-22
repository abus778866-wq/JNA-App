package org.jamia.noorulanwar.storage;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.UriPermission;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.Settings;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * JamiaStorage: the bridge between the web app and the phone's real storage.
 *
 *  - pickFolder       opens the system folder picker (Files app) and remembers the choice
 *  - listFolders      folders the user already granted (still valid after a restart)
 *  - stat/readdir/mkdir/readFile/writeFile/deleteFile/rename/openFolder   real file operations inside a granted folder
 *  - checkAppPermissions / requestAppPermissions   camera, microphone, media (photos/videos/audio) runtime permissions
 *  - openAppSettings  jump to the app's settings page when a permission was denied "for good"
 *
 * Folder access uses the Storage Access Framework: the user's choice IS the permission, so it works on every
 * Android version (including 11+ scoped storage) without "all files access".
 */
@CapacitorPlugin(
  name = "JamiaStorage",
  permissions = {
    @Permission(alias = "camera", strings = { "android.permission.CAMERA" }),
    @Permission(alias = "microphone", strings = { "android.permission.RECORD_AUDIO" }),
    @Permission(alias = "mediaImages", strings = { "android.permission.READ_MEDIA_IMAGES" }),
    @Permission(alias = "mediaVideo", strings = { "android.permission.READ_MEDIA_VIDEO" }),
    @Permission(alias = "mediaAudio", strings = { "android.permission.READ_MEDIA_AUDIO" }),
    @Permission(alias = "legacyRead", strings = { "android.permission.READ_EXTERNAL_STORAGE" }),
    @Permission(alias = "legacyWrite", strings = { "android.permission.WRITE_EXTERNAL_STORAGE" })
  }
)
public class JamiaStoragePlugin extends Plugin {
  private SafStore store;

  @Override
  public void load() {
    store = new SafStore(getContext());
  }

  /* ================================================================ folder picker */

  @PluginMethod
  public void pickFolder(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
    intent.addFlags(
      Intent.FLAG_GRANT_READ_URI_PERMISSION
        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
    );
    String initial = call.getString("initialUri");
    if (initial != null && Build.VERSION.SDK_INT >= 26) {
      try { intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(initial)); } catch (Exception ignored) { /* optional */ }
    }
    try {
      startActivityForResult(call, intent, "onFolderPicked");
    } catch (ActivityNotFoundException e) {
      call.reject("This device has no file browser that can choose a folder.", "NO_PICKER");
    }
  }

  @ActivityCallback
  private void onFolderPicked(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Intent data = result.getData();
    if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
      JSObject cancelled = new JSObject();
      cancelled.put("cancelled", true);
      call.resolve(cancelled);
      return;
    }
    Uri tree = data.getData();
    if (!SafStore.isPhoneStorage(tree)) {
      call.reject("Please choose a folder on this phone or its SD card (not a cloud drive).", "UNSUPPORTED_PROVIDER");
      return;
    }
    DocumentFile root = DocumentFile.fromTreeUri(getContext(), tree);
    if (root == null || !root.isDirectory() || !root.canWrite()) {
      call.reject("That folder is read-only. Choose another folder.", "READ_ONLY");
      return;
    }
    if (call.getBoolean("persist", true)) {
      try {
        int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        getContext().getContentResolver().takePersistableUriPermission(tree, flags);
      } catch (SecurityException e) {
        call.reject("Android did not allow the app to keep access to that folder. Choose another folder.", "EACCES");
        return;
      }
    }
    JSObject out = new JSObject();
    out.put("uri", tree.toString());
    out.put("label", SafStore.labelFor(tree));
    call.resolve(out);
  }

  @PluginMethod
  public void listFolders(PluginCall call) {
    JSArray folders = new JSArray();
    for (UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
      Uri u = p.getUri();
      if (!p.isReadPermission() || !p.isWritePermission() || !SafStore.isPhoneStorage(u)) continue;
      JSObject f = new JSObject();
      f.put("uri", u.toString());
      f.put("label", SafStore.labelFor(u));
      folders.put(f);
    }
    JSObject out = new JSObject();
    out.put("folders", folders);
    call.resolve(out);
  }

  @PluginMethod
  public void releaseFolder(PluginCall call) {
    String uri = call.getString("uri");
    if (uri != null) {
      try {
        getContext().getContentResolver().releasePersistableUriPermission(
          Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
      } catch (Exception ignored) { /* not granted */ }
    }
    call.resolve();
  }

  @PluginMethod
  public void openFolder(PluginCall call) {
    try {
      Uri tree = Uri.parse(call.getString("uri", ""));
      Uri dir = DocumentsContract.buildDocumentUri(SafStore.EXTERNAL_AUTHORITY, DocumentsContract.getTreeDocumentId(tree));
      Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(dir, DocumentsContract.Document.MIME_TYPE_DIR)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
      getContext().startActivity(view);
      call.resolve();
    } catch (ActivityNotFoundException e) {
      call.reject("No file browser is available to open the folder.", "NO_APP");
    } catch (Exception e) {
      fail(call, e);
    }
  }

  /* ================================================================ file operations */

  private DocumentFile root(PluginCall call) throws IOException {
    String uri = call.getString("uri");
    if (uri == null || uri.isEmpty()) throw new IOException("No storage folder selected.");
    return store.root(uri);
  }

  private static String pathOf(PluginCall call) {
    String p = call.getString("path");
    return p == null ? "" : p;
  }

  private static void fail(PluginCall call, Exception e) {
    String code = e instanceof FileNotFoundException ? "ENOENT"
      : e instanceof SecurityException ? "EACCES"
      : e instanceof SafStore.CrossFolderException ? "CROSS_FOLDER"
      : "EIO";
    String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
    call.reject(msg, code);
  }

  @PluginMethod
  public void stat(PluginCall call) {
    try {
      SafStore.Info i = store.stat(root(call), pathOf(call));
      JSObject o = new JSObject();
      o.put("exists", i.exists);
      o.put("isFile", i.isFile);
      o.put("isDirectory", i.isDirectory);
      o.put("size", i.size);
      o.put("modified", i.modified);
      call.resolve(o);
    } catch (Exception e) { fail(call, e); }
  }

  @PluginMethod
  public void readdir(PluginCall call) {
    try {
      JSArray names = new JSArray();
      for (DocumentFile f : store.list(root(call), pathOf(call))) if (f.getName() != null) names.put(f.getName());
      JSObject o = new JSObject();
      o.put("files", names);
      call.resolve(o);
    } catch (Exception e) { fail(call, e); }
  }

  @PluginMethod
  public void mkdir(PluginCall call) {
    try {
      store.mkdir(root(call), pathOf(call));
      call.resolve();
    } catch (Exception e) { fail(call, e); }
  }

  @PluginMethod
  public void readFile(PluginCall call) {
    try {
      byte[] bytes = store.read(root(call), pathOf(call));
      JSObject o = new JSObject();
      o.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
      call.resolve(o);
    } catch (Exception e) { fail(call, e); }
  }

  @PluginMethod
  public void writeFile(PluginCall call) {
    try {
      String data = call.getString("data");
      if (data == null) throw new IOException("No data to write.");
      store.write(root(call), pathOf(call), Base64.decode(data, Base64.DEFAULT), call.getBoolean("append", false));
      call.resolve();
    } catch (Exception e) { fail(call, e); }
  }

  @PluginMethod
  public void deleteFile(PluginCall call) {
    try {
      JSObject o = new JSObject();
      o.put("deleted", store.delete(root(call), pathOf(call)));
      call.resolve(o);
    } catch (Exception e) { fail(call, e); }
  }

  @PluginMethod
  public void rename(PluginCall call) {
    try {
      String from = call.getString("from"), to = call.getString("to");
      if (from == null || to == null) throw new IOException("Missing path.");
      store.rename(root(call), from, to, call.getBoolean("overwrite", true));
      call.resolve();
    } catch (Exception e) { fail(call, e); }
  }

  /* ================================================================ runtime permissions */

  /** Groups: "camera", "microphone", "media" (= photos, videos, audio; the right set for this Android version). */
  private static List<String> aliasesFor(String group) {
    List<String> a = new ArrayList<>();
    switch (group) {
      case "camera": a.add("camera"); break;
      case "microphone": a.add("microphone"); break;
      case "media":
      case "storage":
        if (Build.VERSION.SDK_INT >= 33) a.addAll(Arrays.asList("mediaImages", "mediaVideo", "mediaAudio"));
        else {
          a.add("legacyRead");
          if (Build.VERSION.SDK_INT <= 29) a.add("legacyWrite");
        }
        break;
      default: break;
    }
    return a;
  }

  private static List<String> groupsOf(PluginCall call) {
    List<String> groups = new ArrayList<>();
    JSArray arr = call.getArray("groups");
    if (arr != null) {
      for (int i = 0; i < arr.length(); i++) {
        try { groups.add(arr.getString(i)); } catch (Exception ignored) { /* skip */ }
      }
    }
    if (groups.isEmpty()) groups.addAll(Arrays.asList("camera", "microphone", "media"));
    return groups;
  }

  private JSObject statusFor(List<String> groups) {
    JSObject out = new JSObject();
    for (String g : groups) {
      List<String> aliases = aliasesFor(g);
      if (aliases.isEmpty()) continue;
      boolean granted = true, denied = false;
      for (String alias : aliases) {
        PermissionState s = getPermissionState(alias);
        if (s != PermissionState.GRANTED) granted = false;
        if (s == PermissionState.DENIED) denied = true;   // refused and Android will not ask again
      }
      JSObject o = new JSObject();
      o.put("state", granted ? "granted" : denied ? "denied" : "prompt");
      o.put("canAskAgain", !denied);
      out.put(g, o);
    }
    return out;
  }

  @PluginMethod
  public void checkAppPermissions(PluginCall call) {
    call.resolve(statusFor(groupsOf(call)));
  }

  @PluginMethod
  public void requestAppPermissions(PluginCall call) {
    Set<String> missing = new LinkedHashSet<>();
    for (String g : groupsOf(call)) {
      for (String alias : aliasesFor(g)) if (getPermissionState(alias) != PermissionState.GRANTED) missing.add(alias);
    }
    if (missing.isEmpty()) {
      call.resolve(statusFor(groupsOf(call)));
      return;
    }
    requestPermissionForAliases(missing.toArray(new String[0]), call, "permissionsDone");
  }

  @PermissionCallback
  private void permissionsDone(PluginCall call) {
    call.resolve(statusFor(groupsOf(call)));   // denial is a normal answer, never an error
  }

  @PluginMethod
  public void openAppSettings(PluginCall call) {
    try {
      Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
      call.resolve();
    } catch (Exception e) {
      fail(call, e);
    }
  }
}
