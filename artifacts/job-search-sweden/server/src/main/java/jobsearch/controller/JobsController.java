package jobsearch.controller;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jobsearch.model.JobSearchInput;
import jobsearch.model.JobSearchResult;
import jobsearch.model.JobSource;
import jobsearch.service.JobSearchService;

@RestController
@RequestMapping("/api/jobs")
public class JobsController {
  private final JobSearchService jobSearchService;

  public JobsController(JobSearchService jobSearchService) {
    this.jobSearchService = jobSearchService;
  }

  @GetMapping("/sources")
  public List<JobSource> listSources() {
    return jobSearchService.sources();
  }

  @PostMapping("/search")
  public JobSearchResult search(@RequestBody JobSearchInput input) {
    return jobSearchService.search(input);
  }
}