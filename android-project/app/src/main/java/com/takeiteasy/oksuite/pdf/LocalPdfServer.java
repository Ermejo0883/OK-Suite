package com.takeiteasy.oksuite.pdf;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;

/**
 * Mini server HTTP locale per servire un singolo PDF a Chrome nel TWA.
 * Chrome può fare fetch() su http://localhost:PORT senza problemi CORS/mixed-content.
 */
public class LocalPdfServer {
    private final byte[] pdfBytes;
    private ServerSocket serverSocket;
    private Thread serverThread;

    public LocalPdfServer(byte[] pdfBytes) throws Exception {
        this.pdfBytes = pdfBytes;
        this.serverSocket = new ServerSocket(0); // porta libera casuale
    }

    public int getPort() {
        return serverSocket.getLocalPort();
    }

    public void start() {
        serverThread = new Thread(() -> {
            try {
                Socket client = serverSocket.accept();

                // Drena la richiesta HTTP in arrivo
                InputStream in = client.getInputStream();
                byte[] buf = new byte[8192];
                in.read(buf);

                // Risposta HTTP con il PDF e header CORS
                OutputStream out = client.getOutputStream();
                String headers =
                    "HTTP/1.1 200 OK\r\n" +
                    "Content-Type: application/pdf\r\n" +
                    "Content-Length: " + pdfBytes.length + "\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Connection: close\r\n\r\n";
                out.write(headers.getBytes("UTF-8"));
                out.write(pdfBytes);
                out.flush();
                client.close();
            } catch (Exception ignored) {
            } finally {
                stop();
            }
        });
        serverThread.setDaemon(true);
        serverThread.start();
    }

    public void stop() {
        try { serverSocket.close(); } catch (Exception ignored) {}
    }
}
