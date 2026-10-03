package jobsearch.model;

public record ResumeImportResult(
    String filename,
    String extractedText,
    int wordCount,
    boolean retained
) {}