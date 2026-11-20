package io.github.jeremy333.tablegames;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A tiny web server for the host phone. It serves the Table Games web app to
 * phones on the hotspot and relays game messages between the host page and
 * each player over WebSockets. Plain Java, no libraries, no internet needed.
 *
 * Message relay (text frames):
 *   server -> host:   "join|ID", "msg|ID|<json>", "leave|ID"
 *   host -> server:   "ID|<json>" to send to one player, "close|ID" to drop one
 *   player <-> server: plain JSON
 */
public class LocalServer {

    /** Where the web app's files come from (app assets on Android, a folder when testing). */
    public interface Files {
        InputStream open(String path) throws IOException;
    }

    private final Files files;
    private final int port;
    private ServerSocket server;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private volatile WsConn host;
    private final Map<Integer, WsConn> players = new ConcurrentHashMap<>();
    private final AtomicInteger nextId = new AtomicInteger(1);

    public LocalServer(Files files, int port) {
        this.files = files;
        this.port = port;
    }

    public int getPort() {
        return server != null ? server.getLocalPort() : port;
    }

    public void start() throws IOException {
        server = new ServerSocket();
        server.setReuseAddress(true);
        server.bind(new InetSocketAddress(port));
        pool.execute(() -> {
            while (!server.isClosed()) {
                try {
                    Socket s = server.accept();
                    s.setTcpNoDelay(true);
                    pool.execute(() -> handle(s));
                } catch (IOException e) {
                    if (server.isClosed()) return;
                }
            }
        });
    }

    public void stop() {
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        for (WsConn c : players.values()) c.close();
        if (host != null) host.close();
        pool.shutdownNow();
    }

    // ---------- HTTP ----------

    private void handle(Socket s) {
        try {
            InputStream in = s.getInputStream();
            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) { s.close(); return; }
            Map<String, String> headers = new HashMap<>();
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                int c = line.indexOf(':');
                if (c > 0) headers.put(line.substring(0, c).trim().toLowerCase(Locale.ROOT), line.substring(c + 1).trim());
            }
            String[] parts = requestLine.split(" ");
            String method = parts[0];
            String target = parts.length > 1 ? parts[1] : "/";
            String path = target;
            String query = "";
            int q = target.indexOf('?');
            if (q >= 0) { path = target.substring(0, q); query = target.substring(q + 1); }
            path = URLDecoder.decode(path, "UTF-8");

            if ("/ws".equals(path) && "websocket".equalsIgnoreCase(headers.getOrDefault("upgrade", ""))) {
                openWebSocket(s, headers, query);
                return; // socket stays open
            }
            OutputStream out = new BufferedOutputStream(s.getOutputStream());
            if ("/tg-local/info".equals(path)) {
                sendBytes(out, 200, "application/json", infoJson().getBytes(StandardCharsets.UTF_8), !"HEAD".equals(method));
            } else {
                serveFile(out, path, !"HEAD".equals(method));
            }
            out.flush();
            s.close();
        } catch (IOException e) {
            try { s.close(); } catch (IOException ignored) { }
        }
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int b;
        while ((b = in.read()) != -1) {
            if (b == '\n') break;
            if (b != '\r') buf.write(b);
            if (buf.size() > 16384) throw new IOException("Header too long");
        }
        if (b == -1 && buf.size() == 0) return null;
        return buf.toString("UTF-8");
    }

    private void serveFile(OutputStream out, String path, boolean body) throws IOException {
        if (path.endsWith("/")) path += "index.html";
        String rel = path.startsWith("/") ? path.substring(1) : path;
        if (rel.contains("..") || rel.startsWith("android/")) { sendBytes(out, 404, "text/plain", "Not found".getBytes(StandardCharsets.UTF_8), body); return; }
        try (InputStream f = files.open(rel)) {
            ByteArrayOutputStream data = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int n;
            while ((n = f.read(chunk)) > 0) data.write(chunk, 0, n);
            sendBytes(out, 200, mimeType(rel), data.toByteArray(), body);
        } catch (IOException e) {
            sendBytes(out, 404, "text/plain", "Not found".getBytes(StandardCharsets.UTF_8), body);
        }
    }

    private static void sendBytes(OutputStream out, int status, String type, byte[] data, boolean body) throws IOException {
        String head = "HTTP/1.1 " + status + (status == 200 ? " OK" : " Not Found") + "\r\n"
            + "Content-Type: " + type + "\r\n"
            + "Content-Length: " + data.length + "\r\n"
            + "Cache-Control: no-cache\r\n"
            + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.UTF_8));
        if (body) out.write(data);
    }

    private static String mimeType(String p) {
        String l = p.toLowerCase(Locale.ROOT);
        if (l.endsWith(".html")) return "text/html; charset=utf-8";
        if (l.endsWith(".js") || l.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (l.endsWith(".css")) return "text/css; charset=utf-8";
        if (l.endsWith(".json") || l.endsWith(".webmanifest")) return "application/json";
        if (l.endsWith(".svg")) return "image/svg+xml";
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
        if (l.endsWith(".webp")) return "image/webp";
        if (l.endsWith(".mp3")) return "audio/mpeg";
        if (l.endsWith(".txt") || l.endsWith(".md")) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }

    /** The phone's network addresses, so the host page can show the right join code. */
    private String infoJson() {
        StringBuilder sb = new StringBuilder("{\"port\":").append(getPort()).append(",\"addresses\":[");
        boolean first = true;
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    if (!first) sb.append(',');
                    first = false;
                    sb.append("{\"name\":\"").append(ni.getName().replace("\"", "")).append("\",\"ip\":\"")
                        .append(a.getHostAddress()).append("\"}");
                }
            }
        } catch (Exception ignored) { }
        return sb.append("]}").toString();
    }

    // ---------- WebSocket ----------

    private void openWebSocket(Socket s, Map<String, String> headers, String query) throws IOException {
        String key = headers.get("sec-websocket-key");
        if (key == null) { s.close(); return; }
        String accept;
        try {
            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            accept = Base64.getEncoder().encodeToString(
                sha1.digest((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            s.close();
            return;
        }
        OutputStream out = s.getOutputStream();
        out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            + "Sec-WebSocket-Accept: " + accept + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.flush();

        boolean isHost = query.contains("role=host") && s.getInetAddress().isLoopbackAddress();
        WsConn conn = new WsConn(s);
        if (isHost) {
            WsConn old = host;
            host = conn;
            if (old != null) old.close();
            // A newly opened host page starts a fresh table: players rejoin.
            for (Integer id : players.keySet()) {
                WsConn p = players.remove(id);
                if (p != null) p.close();
            }
            runHost(conn);
        } else {
            int id = nextId.getAndIncrement();
            players.put(id, conn);
            WsConn h = host;
            if (h != null) h.sendText("join|" + id);
            runPlayer(id, conn);
        }
    }

    private void runHost(WsConn conn) {
        try {
            String msg;
            while ((msg = conn.readText()) != null) {
                int bar = msg.indexOf('|');
                if (bar < 0) continue;
                String head = msg.substring(0, bar);
                String rest = msg.substring(bar + 1);
                if ("close".equals(head)) {
                    WsConn p = players.remove(parseId(rest));
                    if (p != null) p.close();
                } else {
                    WsConn p = players.get(parseId(head));
                    if (p != null) p.sendText(rest);
                }
            }
        } catch (IOException ignored) {
        } finally {
            conn.close();
            if (host == conn) host = null;
        }
    }

    private void runPlayer(int id, WsConn conn) {
        try {
            String msg;
            while ((msg = conn.readText()) != null) {
                WsConn h = host;
                if (h != null) h.sendText("msg|" + id + "|" + msg);
            }
        } catch (IOException ignored) {
        } finally {
            conn.close();
            if (players.remove(id) != null) {
                WsConn h = host;
                if (h != null) h.sendText("leave|" + id);
            }
        }
    }

    private static int parseId(String s) {
        try { return Integer.parseInt(s.trim()); } catch (NumberFormatException e) { return -1; }
    }

    /** One WebSocket connection: reads client frames, writes server frames. */
    static class WsConn {
        private final Socket socket;
        private final InputStream in;
        private final OutputStream out;
        private volatile boolean closed;

        WsConn(Socket s) throws IOException {
            socket = s;
            in = s.getInputStream();
            out = s.getOutputStream();
            s.setKeepAlive(true);
        }

        /** Returns the next text message, or null when the connection closes. */
        String readText() throws IOException {
            ByteArrayOutputStream message = new ByteArrayOutputStream();
            while (true) {
                int b0 = in.read();
                int b1 = in.read();
                if (b0 < 0 || b1 < 0) return null;
                boolean fin = (b0 & 0x80) != 0;
                int opcode = b0 & 0x0F;
                boolean masked = (b1 & 0x80) != 0;
                long len = b1 & 0x7F;
                if (len == 126) len = ((long) readByte() << 8) | readByte();
                else if (len == 127) { len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | readByte(); }
                if (len > 8L * 1024 * 1024) throw new IOException("Message too large");
                byte[] mask = new byte[4];
                if (masked) readFully(mask);
                byte[] payload = new byte[(int) len];
                readFully(payload);
                if (masked) for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];

                if (opcode == 0x8) { close(); return null; }               // close
                if (opcode == 0x9) { sendFrame(0xA, payload); continue; }  // ping -> pong
                if (opcode == 0xA) continue;                                 // pong
                if (opcode == 0x1 || opcode == 0x0) {                        // text / continuation
                    message.write(payload);
                    if (fin) return message.toString("UTF-8");
                }
            }
        }

        private int readByte() throws IOException {
            int b = in.read();
            if (b < 0) throw new IOException("Closed");
            return b;
        }

        private void readFully(byte[] buf) throws IOException {
            int off = 0;
            while (off < buf.length) {
                int n = in.read(buf, off, buf.length - off);
                if (n < 0) throw new IOException("Closed");
                off += n;
            }
        }

        void sendText(String text) {
            try {
                sendFrame(0x1, text.getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                close();
            }
        }

        private synchronized void sendFrame(int opcode, byte[] payload) throws IOException {
            if (closed) return;
            ByteArrayOutputStream f = new ByteArrayOutputStream(payload.length + 10);
            f.write(0x80 | opcode);
            if (payload.length < 126) {
                f.write(payload.length);
            } else if (payload.length <= 0xFFFF) {
                f.write(126);
                f.write(payload.length >>> 8);
                f.write(payload.length & 0xFF);
            } else {
                f.write(127);
                long l = payload.length;
                for (int i = 7; i >= 0; i--) f.write((int) (l >>> (8 * i)) & 0xFF);
            }
            f.write(payload);
            out.write(f.toByteArray());
            out.flush();
        }

        void close() {
            if (closed) return;
            try { sendFrame(0x8, new byte[0]); } catch (IOException ignored) { }
            closed = true;
            try { socket.close(); } catch (IOException ignored) { }
        }
    }

    /** For testing on a computer: java LocalServer.java <site folder> [port] */
    public static void main(String[] args) throws Exception {
        java.io.File root = new java.io.File(args.length > 0 ? args[0] : ".");
        int port = args.length > 1 ? Integer.parseInt(args[1]) : 8737;
        LocalServer srv = new LocalServer(p -> new java.io.FileInputStream(new java.io.File(root, p)), port);
        srv.start();
        System.out.println("Table Games host server on port " + srv.getPort());
        Thread.currentThread().join();
    }
}
