package se.jobsearch.model;

public record JobSourceResult(
    String sourceId,
    String name,
    String status,
    int resultCount,
    String message
) {}