package jobsearch.service;

import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import jobsearch.model.JobListing;

/**
  This class handles retrieving the RSS/Atom feed results
**/
@Service
public class CustomFeedService {
  private static final int MAX_FEED_BYTES = 2 * 1024 * 1024;
  private static final HttpClient HTTP = SystemTrustHttp.builder()
      .connectTimeout(Duration.ofSeconds(5))
      .followRedirects(HttpClient.Redirect.NEVER)
      .build();

  public FeedResult fetch(String rawUrl, int limit) throws Exception {
    URI uri = validatePublicFeedUrl(rawUrl);
    HttpRequest request = HttpRequest.newBuilder(uri)
        .timeout(Duration.ofSeconds(12))
        .header("Accept", "application/atom+xml, application/rss+xml, application/xml, text/xml")
        .header("User-Agent", "SwedenJobSearch/1.0 (personal feed reader)")
        .GET()
        .build();

    HttpResponse<InputStream> response = HTTP.send(request, HttpResponse.BodyHandlers.ofInputStream());
    if (response.statusCode() < 200 || response.statusCode() >= 300) {
      response.body().close();
      throw new IllegalArgumentException("Feed returned HTTP " + response.statusCode());
    }

    byte[] xml;
    try (InputStream stream = response.body();
         ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      int total = 0;
      int read;
      while ((read = stream.read(buffer)) != -1) {
        total += read;
        if (total > MAX_FEED_BYTES) {
          throw new IllegalArgumentException("Feed is larger than 2 MB.");
        }
        output.write(buffer, 0, read);
      }
      xml = output.toByteArray();
    }

    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    factory.setXIncludeAware(false);
    factory.setExpandEntityReferences(false);
    Document document = factory.newDocumentBuilder().parse(new ByteArrayInputStream(xml));
    document.getDocumentElement().normalize();

    List<Element> entries = elements(document, "item");
    if (entries.isEmpty()) {
      entries = elements(document, "entry");
    }
    List<JobListing> jobs = new ArrayList<>();
    String host = uri.getHost();
    String sourceName = host == null ? "Custom feed" : host.replaceFirst("^www\\.", "");
    for (Element entry : entries.stream().limit(limit).toList()) {
      String title = text(entry, "title");
      String link = safeListingLink(uri, link(entry));
      if (title.isBlank() || link.isBlank()) {
        continue;
      }
      String description = firstNonBlank(
          text(entry, "description"),
          text(entry, "summary"),
          text(entry, "content")
      );
      String deadline = firstNonBlank(
          textByName(entry, "applicationdeadline"),
          textByName(entry, "deadline"),
          textByName(entry, "closingdate")
      );
      String published = firstNonBlank(
          parseDate(text(entry, "pubDate")),
          parseDate(text(entry, "published")),
          parseDate(text(entry, "updated"))
      );
      String employer = firstNonBlank(text(entry, "author"), text(entry, "creator"));
      String id = firstNonBlank(text(entry, "guid"), text(entry, "id"), link);
      jobs.add(new JobListing(
          id,
          stripMarkup(title),
          blankToNull(stripMarkup(employer)),
          null,
          List.of("custom-feed"),
          List.of(sourceName),
          link,
          stripMarkup(description),
          List.of(),
          List.of(),
          null,
          blankToNull(published),
          blankToNull(parseDate(deadline)),
          null,
          "excerpt"
      ));
    }
    return new FeedResult(sourceName, List.copyOf(jobs));
  }

  private URI validatePublicFeedUrl(String rawUrl) throws Exception {
    URI uri;
    try {
      uri = URI.create(rawUrl.trim()).normalize();
    } catch (RuntimeException error) {
      throw new IllegalArgumentException("Enter a valid RSS or Atom feed URL.");
    }
    String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
    String host = uri.getHost();
    if ((!scheme.equals("https") && !scheme.equals("http"))
        || host == null
        || uri.getUserInfo() != null
        || (uri.getPort() != -1 && uri.getPort() != 80 && uri.getPort() != 443)) {
      throw new IllegalArgumentException("Feeds must use a public HTTP or HTTPS URL.");
    }

    String normalizedHost = host.toLowerCase(Locale.ROOT);
    if (normalizedHost.equals("localhost")
        || normalizedHost.endsWith(".localhost")
        || normalizedHost.endsWith(".local")
        || normalizedHost.endsWith(".internal")
        || normalizedHost.equals("metadata.google.internal")) {
      throw new IllegalArgumentException("Private network URLs cannot be used as feeds.");
    }

    for (InetAddress address : InetAddress.getAllByName(host)) {
      if (address.isAnyLocalAddress()
          || address.isLoopbackAddress()
          || address.isLinkLocalAddress()
          || address.isSiteLocalAddress()
          || address.isMulticastAddress()) {
        throw new IllegalArgumentException("Private network URLs cannot be used as feeds.");
      }
    }
    return uri;
  }

  private List<Element> elements(Document document, String name) {
    NodeList nodes = document.getElementsByTagNameNS("*", name);
    if (nodes.getLength() == 0) {
      nodes = document.getElementsByTagName(name);
    }
    List<Element> result = new ArrayList<>();
    for (int i = 0; i < nodes.getLength(); i++) {
      Node node = nodes.item(i);
      if (node instanceof Element element) {
        result.add(element);
      }
    }
    return result;
  }

  private String text(Element element, String tagName) {
    NodeList nodes = element.getElementsByTagNameNS("*", tagName);
    if (nodes.getLength() == 0) {
      nodes = element.getElementsByTagName(tagName);
    }
    return nodes.getLength() == 0 ? "" : nodes.item(0).getTextContent().trim();
  }

  private String textByName(Element element, String expected) {
    NodeList nodes = element.getElementsByTagName("*");
    for (int i = 0; i < nodes.getLength(); i++) {
      Node node = nodes.item(i);
      if (node.getNodeType() == Node.ELEMENT_NODE
          && node.getNodeName().replaceFirst("^.*:", "").replaceAll("[_-]", "")
              .equalsIgnoreCase(expected)) {
        return node.getTextContent().trim();
      }
    }
    return "";
  }

  private String link(Element element) {
    NodeList links = element.getElementsByTagNameNS("*", "link");
    if (links.getLength() == 0) {
      links = element.getElementsByTagName("link");
    }
    if (links.getLength() == 0) {
      return "";
    }
    Node first = links.item(0);
    if (first instanceof Element link && link.hasAttribute("href")) {
      String rel = link.getAttribute("rel");
      if (rel.isBlank() || rel.equalsIgnoreCase("alternate")) {
        return link.getAttribute("href").trim();
      }
      for (int i = 0; i < links.getLength(); i++) {
        Node node = links.item(i);
        if (node instanceof Element candidate
            && candidate.getAttribute("rel").equalsIgnoreCase("alternate")) {
          return candidate.getAttribute("href").trim();
        }
      }
    }
    return first.getTextContent().trim();
  }

  private String parseDate(String value) {
    if (value == null || value.isBlank()) {
      return "";
    }
    try {
      return ZonedDateTime.parse(value.trim(), DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toString();
    } catch (RuntimeException ignored) {
      try {
        return java.time.Instant.parse(value.trim()).toString();
      } catch (RuntimeException ignoredAgain) {
        try {
          return LocalDateTime.parse(value.trim()).toInstant(ZoneOffset.UTC).toString();
        } catch (RuntimeException ignoredLocalTime) {
          try {
            return LocalDate.parse(value.trim()).atStartOfDay().toInstant(ZoneOffset.UTC).toString();
          } catch (RuntimeException ignoredDate) {
            return "";
          }
        }
      }
    }
  }

  private String safeListingLink(URI feedUri, String rawLink) {
    if (rawLink == null || rawLink.isBlank()) {
      return "";
    }
    try {
      URI resolved = feedUri.resolve(rawLink.trim()).normalize();
      String scheme = resolved.getScheme() == null ? "" : resolved.getScheme().toLowerCase(Locale.ROOT);
      return (scheme.equals("http") || scheme.equals("https"))
          && resolved.getHost() != null
          && resolved.getUserInfo() == null
          ? resolved.toString()
          : "";
    } catch (RuntimeException error) {
      return "";
    }
  }

  private String stripMarkup(String value) {
    return value == null ? "" : value
        .replaceAll("(?is)<script[^>]*>.*?</script>", " ")
        .replaceAll("(?is)<style[^>]*>.*?</style>", " ")
        .replaceAll("(?s)<[^>]+>", " ")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replaceAll("\\s+", " ")
        .trim();
  }

  private String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value;
      }
    }
    return "";
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }

  public record FeedResult(String name, List<JobListing> jobs) {}
}