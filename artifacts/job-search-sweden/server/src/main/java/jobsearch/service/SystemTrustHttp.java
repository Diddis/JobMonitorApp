package jobsearch.service;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/**
  Provides HTTP client builders configured with a custom SSL context that
  combines trusted certificates from the Java trust store and the operating
  system's CA certificate bundle.

  Allows HTTPS connections to validate server certificates against both
  sources of trusted certificate authorities.
**/
public final class SystemTrustHttp {
  private static final SSLContext SSL_CONTEXT = createSslContext();

  private SystemTrustHttp() {}

  public static java.net.http.HttpClient.Builder builder() {
    return java.net.http.HttpClient.newBuilder().sslContext(SSL_CONTEXT);
  }

  private static SSLContext createSslContext() {
    try {
      KeyStore trustStore = KeyStore.getInstance(KeyStore.getDefaultType());
      trustStore.load(null, null);

      TrustManagerFactory defaultFactory =
          TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
      defaultFactory.init((KeyStore) null);
      int index = 0;
      for (TrustManager manager : defaultFactory.getTrustManagers()) {
        if (manager instanceof X509TrustManager x509) {
          for (Certificate certificate : x509.getAcceptedIssuers()) {
            trustStore.setCertificateEntry("jdk-root-" + index++, certificate);
          }
        }
      }

      Path systemBundle = systemCertificateBundle();
      String pemBundle = new String(Files.readAllBytes(systemBundle), StandardCharsets.ISO_8859_1);
      Matcher certificates = Pattern.compile(
          "-----BEGIN CERTIFICATE-----[\\s\\S]*?-----END CERTIFICATE-----"
      ).matcher(pemBundle);
      CertificateFactory certificateFactory = CertificateFactory.getInstance("X.509");
      int systemCertificateCount = 0;
      while (certificates.find()) {
        byte[] pem = certificates.group().getBytes(StandardCharsets.US_ASCII);
        Certificate certificate = certificateFactory.generateCertificate(new ByteArrayInputStream(pem));
        trustStore.setCertificateEntry("system-root-" + index++, certificate);
        systemCertificateCount++;
      }
      if (systemCertificateCount == 0) {
        throw new IllegalStateException("The system CA bundle did not contain any PEM certificates.");
      }

      TrustManagerFactory combinedFactory =
          TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
      combinedFactory.init(trustStore);
      SSLContext context = SSLContext.getInstance("TLS");
      context.init(null, combinedFactory.getTrustManagers(), null);
      return context;
    } catch (Exception error) {
      throw new IllegalStateException("Unable to load the system certificate bundle for HTTPS requests.", error);
    }
  }

  private static Path systemCertificateBundle() {
    String configured = System.getenv("SSL_CERT_FILE");
    if (configured != null && !configured.isBlank()) {
      Path path = Path.of(configured);
      if (Files.isRegularFile(path)) {
        return path;
      }
    }
    Path standardBundle = Path.of("/etc/ssl/certs/ca-certificates.crt");
    if (Files.isRegularFile(standardBundle)) {
      return standardBundle;
    }
    throw new IllegalStateException("No system CA bundle is available.");
  }
}