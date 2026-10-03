package jobsearch.model;

public record JobSource(
    String id,
    String name,
    String description,
    String contentNote
) {}