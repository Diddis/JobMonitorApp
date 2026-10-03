package jobsearch.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import jobsearch.model.JobListing;
import jobsearch.model.JobSearchInput;
import jobsearch.model.JobSearchResult;
import jobsearch.model.JobSource;
import jobsearch.model.JobSourceResult;

/**
  This class 
**/
@Service
public class JobSearchService {
  private static final String JOB_SEARCH_URL = "https://jobsearch.api.jobtechdev.se/search";
  private static final String JOB_LINKS_URL = "https://links.api.jobtechdev.se/joblinks";
  private static final HttpClient HTTP = SystemTrustHttp.builder()
      .connectTimeout(Duration.ofSeconds(5))
      .followRedirects(HttpClient.Redirect.NORMAL)
      .build();

  private final ObjectMapper mapper;   // Convert JSON <-> Java object
  private final CustomFeedService customFeedService;

  public JobSearchService(ObjectMapper mapper, CustomFeedService customFeedService) {
    this.mapper = mapper;
    this.customFeedService = customFeedService;
  }

  // Method returns a list of job sources.
  public List<JobSource> sources() {
    return List.of(
        new JobSource(
            "jobsearch",
            "Platsbanken · JobSearch",
            "Search current ads from Sweden’s Public Employment Service.",
            "Fuller job details may include an application deadline."
        ),
        new JobSource(
            "job-ad-links",
            "JobAd Links",
            "Search references and metadata from a wider group of Swedish job boards.",
            "Descriptions are abbreviated and link to the original posting; deadlines may not be present."
        ),
        new JobSource(
            "custom-feed",
            "Custom RSS / Atom feeds",
            "Add public RSS or Atom job feeds.",
            "Custom feeds are fetched only when you search. Only public HTTP(S) URLs are accepted."
        )
    );
  }

  /**
  Method for ---
  Cleans input then 
  Parameter JobSearchInput is record of search
  **/
  public JobSearchResult search(JobSearchInput input) {
    String query = clean(input.query());
    String location = clean(input.location());
    String searchText = String.join(" ", List.of(query, location).stream().filter(s -> !s.isBlank()).toList());
    List<String> sourceIds = normalizeSources(input.sourceIds(), input.customFeedUrls());
    List<String> feedUrls = input.customFeedUrls() == null ? List.of() : input.customFeedUrls();
    int limit = input.limit() == null ? 30 : Math.max(1, Math.min(50, input.limit()));

    if (searchText.isBlank() && feedUrls.isEmpty()) {
      throw new IllegalArgumentException("Enter a role, keyword, or location before searching.");
    }
    if (feedUrls.size() > 10) {
      throw new IllegalArgumentException("Add no more than 10 custom feeds at a time.");
    }
    if (sourceIds.isEmpty()) {
      throw new IllegalArgumentException("Select at least one job source.");
    }

    List<JobListing> collected = new ArrayList<>();
    List<JobSourceResult> statuses = new ArrayList<>();
    if (sourceIds.contains("jobsearch")) {
      collect(statuses, collected, "jobsearch", "Platsbanken · JobSearch",
          () -> searchJobSearch(searchText, limit));
    }
    if (sourceIds.contains("job-ad-links")) {
      collect(statuses, collected, "job-ad-links", "JobAd Links",
          () -> searchJobAdLinks(searchText, limit));
    }
    if (sourceIds.contains("custom-feed")) {
      searchCustomFeeds(feedUrls, limit, statuses, collected);
    }

    boolean partial = statuses.stream().anyMatch(s -> s.status().equals("failed"));

    List<JobListing> jobs = deduplicateAndSort(collected).stream().limit(limit).toList();
    return new JobSearchResult(jobs, statuses, Instant.now().toString(), partial);
  }

  private List<JobListing> searchJobSearch(String query, int limit) throws Exception {
    JsonNode root = getJson(JOB_SEARCH_URL, query, limit);
    List<JobListing> jobs = new ArrayList<>();
    for (JsonNode hit : root.path("hits")) {
      String id = text(hit, "id");
      String title = first(text(hit, "headline"), text(hit, "title"));
      if (title.isBlank()) {
        continue;
      }
      String employer = text(hit.path("employer"), "name");
      String description = first(
          text(hit.path("description"), "text"),
          text(hit.path("description"), "text_formatted"),
          text(hit, "description")
      );
      List<String> skills = labels(hit.path("must_have").path("skills"));
      List<String> requirements = new ArrayList<>(skills);
      addLabels(requirements, hit.path("must_have").path("work_experiences"));
      addLabels(requirements, hit.path("must_have").path("languages"));
      addLabels(requirements, hit.path("must_have").path("educations"));
      requirements.addAll(extractRequirements(description));
      requirements = deduplicate(requirements);

      String address = workplace(hit.path("workplace_address"));
      String sourceUrl = id.isBlank()
          ? ""
          : "https://arbetsformedlingen.se/platsbanken/annonser/" + id;
      if (sourceUrl.isBlank()) {
        continue;
      }
      String deadline = text(hit, "application_deadline");
      String experience = text(hit, "experience_required");
      if ("true".equalsIgnoreCase(experience)) {
        experience = "Relevant work experience required";
      } else if (experience.isBlank() || "false".equalsIgnoreCase(experience)) {
        experience = "";
      }

      jobs.add(new JobListing(
          "jobsearch:" + id,
          title,
          blankToNull(employer),
          blankToNull(address),
          List.of("jobsearch"),
          List.of("Platsbanken · JobSearch"),
          sourceUrl,
          description,
          requirements,
          skills,
          blankToNull(experience),
          blankToNull(text(hit, "publication_date")),
          blankToNull(deadline),
          blankToNull(text(hit.path("employment_type"), "label")),
          description.length() > 120 ? "full" : "excerpt"
      ));
    }
    return jobs;
  }

  private List<JobListing> searchJobAdLinks(String query, int limit) throws Exception {
    JsonNode root = getJson(JOB_LINKS_URL, query, Math.min(100, limit));
    List<JobListing> jobs = new ArrayList<>();
    for (JsonNode hit : root.path("hits")) {
      String title = first(text(hit, "headline"), text(hit, "title"));
      if (title.isBlank()) {
        continue;
      }
      JsonNode links = hit.path("source_links");
      JsonNode firstLink = links.isArray() && !links.isEmpty() ? links.get(0) : null;
      String sourceUrl = firstLink == null ? "" : safeListingUrl(text(firstLink, "url"));
      if (sourceUrl.isBlank()) {
        continue;
      }
      String sourceName = firstLink == null ? "Original job board" : first(text(firstLink, "label"), "Original job board");
      String description = first(text(hit, "brief"), text(hit, "description"));
      String location = workplace(hit.path("workplace_addresses"));

      jobs.add(new JobListing(
          "job-ad-links:" + text(hit, "id"),
          title,
          blankToNull(text(hit.path("employer"), "name")),
          blankToNull(location),
          List.of("job-ad-links"),
          List.of(sourceName),
          sourceUrl,
          description,
          List.of(),
          List.of(),
          null,
          blankToNull(text(hit, "publication_date")),
          null,
          null,
          "excerpt"
      ));
    }
    return jobs;
  }

  private JsonNode getJson(String endpoint, String query, int limit) throws Exception {
    StringBuilder url = new StringBuilder(endpoint).append("?limit=").append(limit);
    if (query != null && !query.isBlank()) {
      url.append("&q=").append(URLEncoder.encode(query, StandardCharsets.UTF_8));
    }
    HttpRequest request = HttpRequest.newBuilder(URI.create(url.toString()))
        .timeout(Duration.ofSeconds(18))
        .header("Accept", "application/json")
        .header("User-Agent", "SwedenJobSearch/1.0")
        .GET()
        .build();
    HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    if (response.statusCode() < 200 || response.statusCode() >= 300) {
      throw new IllegalStateException("Source returned HTTP " + response.statusCode());
    }
    return mapper.readTree(response.body());
  }

  private void searchCustomFeeds(
      List<String> urls,
      int limit,
      List<JobSourceResult> statuses,
      List<JobListing> jobs
  ) {
    if (urls.isEmpty()) {
      statuses.add(new JobSourceResult("custom-feed", "Custom RSS / Atom feeds", "skipped", 0, "No custom feeds added."));
      return;
    }
    int added = 0;
    List<String> failures = new ArrayList<>();
    for (String url : urls) {
      try {
        CustomFeedService.FeedResult result = customFeedService.fetch(url, limit);
        jobs.addAll(result.jobs());
        added += result.jobs().size();
      } catch (Exception error) {
        String host = safeHost(url);
        failures.add(host + ": " + safeMessage(error));
      }
    }
    String status = failures.isEmpty() ? "success" : "failed";
    String message = failures.isEmpty() ? null : String.join(" · ", failures);
    statuses.add(new JobSourceResult("custom-feed", "Custom RSS / Atom feeds", status, added, message));
  }

  private void collect(
      List<JobSourceResult> statuses,
      List<JobListing> jobs,
      String sourceId,
      String name,
      JobSupplier supplier
  ) {
    try {
      List<JobListing> found = supplier.get();
      jobs.addAll(found);
      statuses.add(new JobSourceResult(sourceId, name, "success", found.size(), null));
    } catch (Exception error) {
      statuses.add(new JobSourceResult(sourceId, name, "failed", 0, safeMessage(error)));
    }
  }

  private List<JobListing> deduplicateAndSort(List<JobListing> items) {
    Map<String, JobListing> byKey = new LinkedHashMap<>();
    for (JobListing job : items) {
      String key = normalizedUrl(job.sourceUrl());
      if (key.isBlank()) {
        key = (clean(job.title()) + "|" + clean(job.employer()) + "|" + clean(job.location()))
            .toLowerCase(Locale.ROOT);
      }
      JobListing existing = byKey.get(key);
      byKey.put(key, existing == null ? job : merge(existing, job));
    }
    return byKey.values().stream()
        .sorted(Comparator.comparing(JobListing::publishedAt, Comparator.nullsLast(Comparator.reverseOrder())))
        .toList();
  }

  private JobListing merge(JobListing first, JobListing second) {
    Set<String> ids = new LinkedHashSet<>(first.sourceIds());
    ids.addAll(second.sourceIds());
    Set<String> names = new LinkedHashSet<>(first.sourceNames());
    names.addAll(second.sourceNames());
    JobListing preferred = "full".equals(first.contentDepth()) ? first
        : ("full".equals(second.contentDepth()) ? second : first);
    JobListing other = preferred == first ? second : first;
    return new JobListing(
        preferred.id(),
        preferred.title(),
        firstNonBlank(preferred.employer(), other.employer()),
        firstNonBlank(preferred.location(), other.location()),
        List.copyOf(ids),
        List.copyOf(names),
        firstNonBlank(preferred.sourceUrl(), other.sourceUrl()),
        firstNonBlank(preferred.description(), other.description()),
        union(preferred.requirements(), other.requirements()),
        union(preferred.skills(), other.skills()),
        firstNonBlank(preferred.experienceRequirement(), other.experienceRequirement()),
        firstNonBlank(preferred.publishedAt(), other.publishedAt()),
        firstNonBlank(preferred.deadline(), other.deadline()),
        firstNonBlank(preferred.employmentType(), other.employmentType()),
        preferred.contentDepth()
    );
  }

  private String workplace(JsonNode node) {
    List<String> parts = new ArrayList<>();
    if (node.isArray()) {
      for (JsonNode item : node) {
        addWorkplaceParts(parts, item);
      }
    } else {
      addWorkplaceParts(parts, node);
    }
    return String.join(", ", new LinkedHashSet<>(parts));
  }

  private void addWorkplaceParts(List<String> parts, JsonNode node) {
    for (String field : List.of("city", "municipality", "region", "country")) {
      String value = text(node, field);
      if (!value.isBlank()) {
        parts.add(value);
      }
    }
  }

  private List<String> labels(JsonNode node) {
    List<String> values = new ArrayList<>();
    addLabels(values, node);
    return deduplicate(values);
  }

  private List<String> extractRequirements(String description) {
    if (description == null || description.isBlank()) {
      return List.of();
    }
    List<String> requirements = new ArrayList<>();
    boolean collecting = false;
    for (String rawLine : description.split("\\R")) {
      String line = rawLine.trim().replaceFirst("^(?:[-*•▪‣]|\\d+[.)])\\s*", "").trim();
      if (line.isBlank()) {
        continue;
      }
      String heading = line.toLowerCase(Locale.ROOT).replaceAll("[\\s:：.!]+$", "");
      if (isRequirementHeading(heading)) {
        collecting = true;
        continue;
      }
      if (collecting && isRequirementEndHeading(heading)) {
        break;
      }
      if (!collecting || line.length() < 6) {
        continue;
      }
      requirements.add(line.length() > 240 ? line.substring(0, 237) + "..." : line);
      if (requirements.size() >= 15) {
        break;
      }
    }
    return deduplicate(requirements);
  }

  private boolean isRequirementHeading(String heading) {
    return Set.of(
        "krav",
        "kravprofil",
        "kvalifikationer",
        "obligatoriska krav",
        "requirements",
        "required qualifications",
        "mandatory qualifications"
    ).contains(heading);
  }

  private boolean isRequirementEndHeading(String heading) {
    return Set.of(
        "meriterande",
        "önskvärt",
        "önskvärda kvalifikationer",
        "nice to have",
        "preferred qualifications",
        "vi erbjuder",
        "om dig",
        "om tjänsten",
        "ansökan",
        "kontakt",
        "what we offer",
        "about you"
    ).contains(heading);
  }

  private void addLabels(List<String> values, JsonNode node) {
    if (node.isArray()) {
      for (JsonNode item : node) {
        String label = first(text(item, "label"), text(item, "name"), item.isTextual() ? item.asText() : "");
        if (!label.isBlank()) {
          values.add(label);
        }
      }
    } else if (node.isObject()) {
      String label = first(text(node, "label"), text(node, "name"));
      if (!label.isBlank()) {
        values.add(label);
      }
    }
  }

  private List<String> union(List<String> first, List<String> second) {
    Set<String> values = new LinkedHashSet<>(first == null ? List.of() : first);
    if (second != null) {
      values.addAll(second);
    }
    return List.copyOf(values);
  }

  private List<String> deduplicate(List<String> values) {
    Map<String, String> unique = new LinkedHashMap<>();
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        unique.putIfAbsent(value.trim().toLowerCase(Locale.ROOT), value.trim());
      }
    }
    return List.copyOf(unique.values());
  }

  private String text(JsonNode node, String field) {
    JsonNode value = node.path(field);
    return value.isMissingNode() || value.isNull() ? "" : value.asText("");
  }

  private String first(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value.trim();
      }
    }
    return "";
  }

  private String firstNonBlank(String first, String second) {
    return first == null || first.isBlank() ? second : first;
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  // Helper method for returning empty string if null or trimming whitespace
  private String clean(String value) {
    return value == null ? "" : value.trim();
  }

  private String normalizedUrl(String value) {
    if (value == null || value.isBlank()) {
      return "";
    }
    return value.trim().replaceFirst("/+$", "").toLowerCase(Locale.ROOT);
  }

  private String safeListingUrl(String value) {
    try {
      URI uri = URI.create(value.trim());
      String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
      return (scheme.equals("http") || scheme.equals("https"))
          && uri.getHost() != null
          && uri.getUserInfo() == null
          ? uri.toString()
          : "";
    } catch (RuntimeException error) {
      return "";
    }
  }

  private List<String> normalizeSources(List<String> requested, List<String> feeds) {
    List<String> input = requested == null || requested.isEmpty()
        ? List.of("jobsearch", "job-ad-links")
        : requested;
    Set<String> result = new LinkedHashSet<>();
    for (String id : input) {
      if (!Set.of("jobsearch", "job-ad-links", "custom-feed").contains(id)) {
        throw new IllegalArgumentException("Unknown source selected.");
      }
      result.add(id);
    }
    if (feeds != null && !feeds.isEmpty()) {
      result.add("custom-feed");
    }
    return List.copyOf(result);
  }

  private String safeHost(String url) {
    try {
      return URI.create(url).getHost();
    } catch (RuntimeException error) {
      return "custom feed";
    }
  }

  private String safeMessage(Exception error) {
    String message = error.getMessage();
    if (message == null || message.isBlank()) {
      return "The source could not be reached.";
    }
    return message.length() > 240 ? message.substring(0, 240) : message;
  }

  @FunctionalInterface
  private interface JobSupplier {
    List<JobListing> get() throws Exception;
  }

}