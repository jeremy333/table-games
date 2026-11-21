package io.github.jeremy333.tablegames;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Keeps the host app current without reinstalling:
 *  - updateSite(): when online, downloads the latest site and games from the
 *    GitHub repo into the app's storage. The app then serves those files instead
 *    of the copy it was built with.
 *  - latestNativeVersion(): reads the newest app version number from Releases,
 *    so the app can offer an update when its own code changes.
 * Plain Java (no Android classes), so it can be tested on a computer.
 */
public class Updater {
    private final String repo;  // "owner/repo"
    private final File root;    // the app's private storage folder

    public Updater(String repo, File root) {
        this.repo = repo;
        this.root = root;
    }

    /** Folder holding the newest downloaded site, once there is one. */
    public File liveDir() {
        return new File(root, "www-live");
    }

    /** Downloads the newest site if the repo has changed. Returns true if new files were installed. */
    public boolean updateSite() {
        try {
            String sha = latestSha();
            if (sha == null) return false;
            File shaFile = new File(root, "www-live.sha");
            if (sha.equals(readText(shaFile)) && new File(liveDir(), "index.html").isFile()) return false;

            File fresh = new File(root, "www-new");
            deleteTree(fresh);
            if (!fresh.mkdirs()) return false;
            try (InputStream in = open("https://codeload.github.com/" + repo + "/zip/" + sha);
                 ZipInputStream zip = new ZipInputStream(in)) {
                ZipEntry e;
                byte[] buf = new byte[16384];
                while ((e = zip.getNextEntry()) != null) {
                    String name = e.getName();
                    int slash = name.indexOf('/');
                    if (slash < 0) continue;
                    name = name.substring(slash + 1); // drop the "repo-sha/" folder
                    if (name.isEmpty() || e.isDirectory() || name.contains("..")
                        || name.startsWith("android/") || name.startsWith(".github/")) continue;
                    File out = new File(fresh, name);
                    File parent = out.getParentFile();
                    if (parent != null && !parent.isDirectory() && !parent.mkdirs()) continue;
                    try (OutputStream o = new FileOutputStream(out)) {
                        int n;
                        while ((n = zip.read(buf)) > 0) o.write(buf, 0, n);
                    }
                }
            }
            // Only switch over if the download looks complete.
            if (!new File(fresh, "index.html").isFile() || !new File(fresh, "js/app.js").isFile()
                || !new File(fresh, "games/catalog.js").isFile()) {
                deleteTree(fresh);
                return false;
            }
            File old = new File(root, "www-old");
            deleteTree(old);
            if (liveDir().exists() && !liveDir().renameTo(old)) return false;
            if (!fresh.renameTo(liveDir())) {
                old.renameTo(liveDir());
                return false;
            }
            deleteTree(old);
            writeText(shaFile, sha);
            return true;
        } catch (Exception e) {
            return false; // no internet or GitHub unavailable: keep using what we have
        }
    }

    /** The newest app version number posted with the app in Releases, or -1 if unknown. */
    public int latestNativeVersion() {
        try (InputStream in = open("https://github.com/" + repo + "/releases/download/host-app/native-version.txt")) {
            return Integer.parseInt(new String(readAll(in), StandardCharsets.UTF_8).trim());
        } catch (Exception e) {
            return -1;
        }
    }

    public String apkUrl() {
        return "https://github.com/" + repo + "/releases/download/host-app/TableGamesHost.apk";
    }

    /**
     * The newest commit on the main branch, read from GitHub's git endpoint
     * (a few KB, and not subject to GitHub's API usage limits).
     */
    String latestSha() throws IOException {
        try (InputStream in = open("https://github.com/" + repo + ".git/info/refs?service=git-upload-pack")) {
            String refs = new String(readAll(in), StandardCharsets.ISO_8859_1);
            int at = refs.indexOf(" refs/heads/main");
            if (at < 40) return null;
            String sha = refs.substring(at - 40, at);
            return sha.matches("[0-9a-f]{40}") ? sha : null;
        }
    }

    private static InputStream open(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", "git/2.0 TableGamesHost");
        c.setConnectTimeout(10000);
        c.setReadTimeout(20000);
        int code = c.getResponseCode();
        // Follow GitHub's redirect to its file storage (https to https).
        for (int hops = 0; (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) && hops < 5; hops++) {
            String next = c.getHeaderField("Location");
            c.disconnect();
            c = (HttpURLConnection) new URL(next).openConnection();
            c.setRequestProperty("User-Agent", "TableGamesHost");
            c.setConnectTimeout(10000);
            c.setReadTimeout(20000);
            code = c.getResponseCode();
        }
        if (code != 200) throw new IOException("HTTP " + code);
        return c.getInputStream();
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        return b.toByteArray();
    }

    private static String readText(File f) {
        try {
            return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            return "";
        }
    }

    private static void writeText(File f, String s) throws IOException {
        Files.write(f.toPath(), s.getBytes(StandardCharsets.UTF_8));
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    /** For testing on a computer: java Updater.java owner/repo <folder> */
    public static void main(String[] args) {
        Updater u = new Updater(args[0], new File(args[1]));
        System.out.println("site updated: " + u.updateSite());
        System.out.println("second check (nothing new): " + u.updateSite());
        System.out.println("newest app version in Releases: " + u.latestNativeVersion());
    }
}
