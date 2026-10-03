package jobsearch.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
  This class extracts text from PDF and DOCX, or just read a TXT file.
**/
@Service
public class ResumeTextExtractor {
  private static final long MAX_BYTES = 5 * 1024 * 1024;

  public String extract(MultipartFile file) throws IOException {
    if (file == null || file.isEmpty()) {
      throw new IllegalArgumentException("Choose a non-empty CV file.");
    }
    if (file.getSize() > MAX_BYTES) {
      throw new IllegalArgumentException("The CV file must be 5 MB or smaller.");
    }

    String filename = file.getOriginalFilename() == null
        ? ""
        : file.getOriginalFilename().toLowerCase(Locale.ROOT);
    byte[] bytes = file.getBytes();

    if (filename.endsWith(".pdf")) {
      try (PDDocument document = Loader.loadPDF(bytes)) {
        return new PDFTextStripper().getText(document).strip();
      }
    }
    if (filename.endsWith(".docx")) {
      try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes));
           XWPFWordExtractor extractor = new XWPFWordExtractor(document)) {
        return extractor.getText().strip();
      }
    }
    if (filename.endsWith(".txt")) {
      return new String(bytes, StandardCharsets.UTF_8).strip();
    }

    throw new IllegalArgumentException("Use a PDF, DOCX, or plain-text CV.");
  }
}