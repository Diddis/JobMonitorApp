package jobsearch.model;

import java.util.List;

public record JobListing(
    String id,
    String title,
    String employer,
    String location,
    List<String> sourceIds,
    List<String> sourceNames,
    String sourceUrl,
    String description,
    List<String> requirements,
    List<String> skills,
    String experienceRequirement,
    String publishedAt,
    String deadline,
    String employmentType,
    String contentDepth
) {}