# Job Monitor

A personalized job discovery tool optimized for the Swedish labor market that aggregates listings from multiple platforms, parses requirements, and scores matches based on a user's unique skill profile.

## Purpose
Keeping track of relevant job postings across multiple platforms is time-consuming and inefficient. It often requires maintaining separate saved searches, subscribing to various email alerts, or repeatedly performing identical keyword queries. 

This application consolidates job listings from multiple distinct sources based on user-defined search criteria. Additionally, it cross-references the technical and professional requirements of each job listing against the user's inputted skills to calculate a baseline percentage match, helping users quickly prioritize their applications.

---

## Method & Architecture

### Backend
The backend is a **Spring Boot** application managed as a Maven-based Java project. 
* **API Layer:** Spring MVC exposes RESTful HTTP endpoints, with Jackson handling JSON serialization and deserialization.
* **Architecture:** The codebase follows a clean Controller-Service-Repository structural pattern.
  * **Controllers:** Orchestrate the request-response lifecycle between the client and internal services.
  * **Services:** Encapsulate core business logic, API data transformations, and skill-matching algorithms.
  * **Models:** Utilize Java `record` classes for immutable, lightweight data transfer objects (DTOs).
* **Data Persistence:** To maintain simplicity and data privacy, user-specific data is stored exclusively in the browser's local storage, while search results are fetched live via downstream APIs.

### Frontend
The user interface is built using **React** and **TypeScript** for robust component architecture and type safety.
* **Build System:** Vite manages the development server and generates optimized production builds.
* **Routing:** Wouter provides lightweight, minimalist routing across the application's three core views: Job Matches, User Profile, and Search Settings.
* **State Management & Networking:** TanStack Query (React Query) handles asynchronous backend requests, caching, and loading/error states in tandem with an auto-generated API client.
* **Styling & Assets:** Vanilla CSS manages layouts and responsive design, while Lucide React provides the iconography.
* **Deployment:** The client application is configured as a Progressive Web App (PWA), allowing native-like installation on mobile and desktop devices.

### Development Note
I built this application in Replit utilizing the Replit Agent. The agent was systematically guided on the specific technology stack, modular architecture, and functional views. While I have more familiarity with backend development, I left more of the frontend development to the AI agent. Visual design elements (such as color schemes, typography, and component sizing) were selected by the AI agent, and I adjusted them as needed based on user requirements and testing. 

---

## Design Considerations

The development process balanced user experience (UX) with technical scalability, applying both user-centered and architectural design principles:

### User-Centered Design (UX/UI)
* **Empathy-Driven Features:** Development prioritized actual user habits, explicitly targeting the frustration of portal fatigue by unifying multiple dashboards into one interface.
* **Iterative Refinement:** System behaviors, layouts, and feature flows were continually refined through hands-on testing and re-design.
* **PWA Accessibility:** Opting for a PWA architecture ensures that users can track application cycles seamlessly on both mobile devices and desktops without the friction of an app store download.

### Architecture & Service-Oriented Design
* **Loose Coupling:** The backend engine isolates external API data dependencies from internal data models. If an external job board changes its payload structure, only the adapter layer in the service class requires adjustment.
* **Interoperability:** By serving standardized JSON endpoints via Spring MVC, the backend can easily integrate with alternative frontend frameworks or third-party data consumers in the future.
* **Stateless Execution:** Because the application relies on live-fetching and browser-based `localStorage`, the backend remains entirely stateless. This significantly reduces server overhead, eliminates database maintenance costs, and inherently secures user data privacy.

---

## Data Sources

The application is engineered explicitly for the Swedish job market and aggregates listings from three primary sources:

1. **Arbetsförmedlingen JobSearch API:** Queries active listings directly from Platsbanken. This provides comprehensive coverage of public sector roles and major corporate listings, as Swedish public authorities are genereally required to post vacancies here.
2. **Arbetsförmedlingen JobAd Links API:** Supplements the search by aggregating metadata from major private third-party job boards across Sweden, extending market coverage by roughly 30%.
3. **Custom RSS/Atom Feeds:** Recognizing that some niche or direct employers bypass aggregated job boards entirely, the application allows users to append direct XML feeds from specific employer career sites to capture hidden market vacancies.
