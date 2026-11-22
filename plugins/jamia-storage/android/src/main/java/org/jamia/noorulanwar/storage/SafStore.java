package org.jamia.noorulanwar.storage;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.webkit.MimeTypeMap;

import androidx.documentfile.provider.DocumentFile;

import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Real file access inside a folder the user picked with the system folder picker
 * (Storage Access Framework). Every path is RELATIVE to the picked folder ("a/b/c.txt").
 * Nothing here is simulated: bytes are read from / written to the phone's (or SD card's) storage.
 */
final class SafStore {
  static final String EXTERNAL_AUTHORITY = "com.android.externalstorage.documents";

  private final Context ctx;

  SafStore(Context context) {
    this.ctx = context.getApplicationContext();
  }

  /* ------------------------------------------------------------------ folders */

  /** "content://...tree/primary%3ADocuments%2FJamiaData" -> "/storage/emulated/0/Documents/JamiaData". */
  static String labelFor(Uri tree) {
    String id = DocumentsContract.getTreeDocumentId(tree);          // "primary:Documents/JamiaData"
    int colon = id.indexOf(':');
    String volume = colon < 0 ? id : id.substring(0, colon);
    String rest = colon < 0 ? "" : id.substring(colon + 1);
    while (rest.endsWith("/")) rest = rest.substring(0, rest.length() - 1);
    String base = "primary".equals(volume) ? "/storage/emulated/0" : "/storage/" + volume;
    return rest.isEmpty() ? base : base + "/" + rest;
  }

  static boolean isPhoneStorage(Uri tree) {
    return tree != null && DocumentsContract.isTreeUri(tree) && EXTERNAL_AUTHORITY.equals(tree.getAuthority());
  }

  DocumentFile root(String treeUri) throws IOException {
    Uri uri = Uri.parse(treeUri);
    if (!DocumentsContract.isTreeUri(uri)) throw new IOException("That is not a folder.");
    DocumentFile root = DocumentFile.fromTreeUri(ctx, uri);
    if (root == null || !root.exists() || !root.isDirectory()) {
      throw new FileNotFoundException("The storage folder is no longer available. Choose it again.");
    }
    return root;
  }

  /* -------------------------------------------------------------------- paths */

  static List<String> segments(String path) throws IOException {
    List<String> out = new ArrayList<>();
    if (path == null) return out;
    for (String s : path.split("/")) {
      if (s.isEmpty() || s.equals(".")) continue;
      if (s.equals("..") || s.indexOf('\0') >= 0) throw new IOException("Invalid path.");
      out.add(s);
    }
    return out;
  }

  /** The file or folder at `path`, or null when it does not exist. */
  DocumentFile find(DocumentFile root, String path) throws IOException {
    DocumentFile cur = root;
    for (String seg : segments(path)) {
      cur = cur.findFile(seg);
      if (cur == null) return null;
    }
    return cur;
  }

  private DocumentFile mkdirs(DocumentFile root, List<String> segs) throws IOException {
    DocumentFile cur = root;
    for (String seg : segs) {
      DocumentFile next = cur.findFile(seg);
      if (next == null) {
        next = cur.createDirectory(seg);
        if (next == null) throw new IOException("Could not create folder \"" + seg + "\".");
      } else if (!next.isDirectory()) {
        throw new IOException("\"" + seg + "\" is a file, not a folder.");
      }
      cur = next;
    }
    return cur;
  }

  void mkdir(DocumentFile root, String path) throws IOException {
    mkdirs(root, segments(path));
  }

  /* -------------------------------------------------------------------- read */

  byte[] read(DocumentFile root, String path) throws IOException {
    DocumentFile f = find(root, path);
    if (f == null || !f.isFile()) throw new FileNotFoundException(path);
    ContentResolver cr = ctx.getContentResolver();
    try (InputStream in = cr.openInputStream(f.getUri())) {
      if (in == null) throw new IOException("Could not open " + path);
      ByteArrayOutputStream out = new ByteArrayOutputStream(Math.max(32, (int) Math.min(f.length(), 64L * 1024 * 1024)));
      byte[] buf = new byte[64 * 1024];
      int n;
      while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
      return out.toByteArray();
    }
  }

  /* ------------------------------------------------------------------- write */

  private static String mimeFor(String name) {
    int dot = name.lastIndexOf('.');
    if (dot > 0 && dot < name.length() - 1) {
      String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase(Locale.ROOT));
      if (m != null) return m;
    }
    return "application/octet-stream";
  }

  /** Creates or replaces the file; data is flushed to the storage device (fsync) before returning. */
  void write(DocumentFile root, String path, byte[] data, boolean append) throws IOException {
    List<String> segs = segments(path);
    if (segs.isEmpty()) throw new IOException("Missing file name.");
    String name = segs.remove(segs.size() - 1);
    DocumentFile parent = mkdirs(root, segs);
    DocumentFile f = parent.findFile(name);
    if (f != null && f.isDirectory()) throw new IOException("\"" + name + "\" is a folder.");
    if (f == null) {
      f = parent.createFile(mimeFor(name), name);
      if (f == null) throw new IOException("Could not create \"" + name + "\".");
      if (!name.equals(f.getName())) {            // some providers add an extension: force the exact name
        String got = f.getName();
        if (!f.renameTo(name) || !name.equals(f.getName())) {
          f.delete();
          throw new IOException("The storage provider renamed \"" + name + "\" to \"" + got + "\".");
        }
      }
    }
    ContentResolver cr = ctx.getContentResolver();
    String mode = append ? "wa" : "wt";
    ParcelFileDescriptor pfd = null;
    try {
      pfd = cr.openFileDescriptor(f.getUri(), mode);
    } catch (FileNotFoundException | SecurityException e) {
      throw e;
    } catch (Exception ignored) { /* provider without descriptor support: use the stream below */ }
    if (pfd != null) {
      try (ParcelFileDescriptor p = pfd; FileOutputStream out = new FileOutputStream(p.getFileDescriptor())) {
        out.write(data);
        out.flush();
        out.getFD().sync();
      }
    } else {
      try (OutputStream out = cr.openOutputStream(f.getUri(), mode)) {
        if (out == null) throw new IOException("Could not open " + path + " for writing.");
        out.write(data);
        out.flush();
      }
    }
  }

  /* --------------------------------------------------- inspect / delete / move */

  boolean delete(DocumentFile root, String path) throws IOException {
    if (segments(path).isEmpty()) throw new IOException("Refusing to delete the storage folder itself.");
    DocumentFile f = find(root, path);
    return f != null && f.delete();            // folders are removed with their content
  }

  /** Renames inside one folder. An existing target is replaced (used for "write temp, then rename over the real file"). */
  void rename(DocumentFile root, String from, String to, boolean overwrite) throws IOException {
    List<String> a = segments(from), b = segments(to);
    if (a.isEmpty() || b.isEmpty()) throw new IOException("Invalid path.");
    DocumentFile src = find(root, from);
    if (src == null) throw new FileNotFoundException(from);
    if (!a.subList(0, a.size() - 1).equals(b.subList(0, b.size() - 1))) throw new CrossFolderException();
    String newName = b.get(b.size() - 1);
    if (newName.equals(src.getName())) return;
    DocumentFile existing = find(root, to);
    if (existing != null) {
      if (!overwrite) throw new IOException("\"" + newName + "\" already exists.");
      if (!existing.delete()) throw new IOException("Could not replace \"" + newName + "\".");
    }
    if (!src.renameTo(newName) || !newName.equals(src.getName())) throw new IOException("Could not rename to \"" + newName + "\".");
  }

  static final class CrossFolderException extends IOException {
    CrossFolderException() { super("Moving between folders is not supported."); }
  }

  static final class Info {
    boolean exists, isFile, isDirectory;
    long size, modified;
  }

  Info stat(DocumentFile root, String path) throws IOException {
    Info i = new Info();
    DocumentFile f = find(root, path);
    if (f == null) return i;
    i.exists = true;
    i.isFile = f.isFile();
    i.isDirectory = f.isDirectory();
    i.size = f.length();
    i.modified = f.lastModified();
    return i;
  }

  List<DocumentFile> list(DocumentFile root, String path) throws IOException {
    DocumentFile d = find(root, path);
    if (d == null || !d.isDirectory()) throw new FileNotFoundException(path);
    List<DocumentFile> out = new ArrayList<>();
    for (DocumentFile f : d.listFiles()) out.add(f);
    return out;
  }
}
