package jobsearch.model;

import java.util.List;

public record JobSearchResult(
    List<JobListing> jobs,
    List<JobSourceResult> sources,
    String refreshedAt,
    boolean partial
) {}