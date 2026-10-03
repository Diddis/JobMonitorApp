package jobsearch.model;

import java.util.List;

public record JobSearchInput(
    String query,
    String location,
    List<String> sourceIds,
    List<String> customFeedUrls,
    Integer limit
) {}