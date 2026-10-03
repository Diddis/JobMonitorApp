package jobsearch.controller;

import java.io.IOException;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import jobsearch.model.JobSearchInput;
import jobsearch.model.JobSearchResult;
import jobsearch.model.JobSource;
import jobsearch.model.ResumeImportResult;
import jobsearch.service.JobSearchService;
import jobsearch.service.ResumeTextExtractor;
import org.springframework.web.bind.annotation.RequestBody;

@RestController
@RequestMapping("/api/jobs")
public class JobsController {
  private final JobSearchService jobSearchService;
  private final ResumeTextExtractor resumeTextExtractor;

  public JobsController(JobSearchService jobSearchService, ResumeTextExtractor resumeTextExtractor) {
    this.jobSearchService = jobSearchService;
    this.resumeTextExtractor = resumeTextExtractor;
  }

  @GetMapping("/sources")
  public List<JobSource> listSources() {
    return jobSearchService.sources();
  }

  @PostMapping("/search")
  public JobSearchResult search(@RequestBody JobSearchInput input) {
    return jobSearchService.search(input);
  }

  @PostMapping(value = "/resume-import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResumeImportResult importResume(@RequestPart("file") MultipartFile file) throws IOException {
    String extractedText = resumeTextExtractor.extract(file);
    int wordCount = extractedText.isBlank() ? 0 : extractedText.split("\\s+").length;
    String filename = file.getOriginalFilename() == null ? "CV" : file.getOriginalFilename();
    return new ResumeImportResult(filename, extractedText, wordCount, false);
  }
}