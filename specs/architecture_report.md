V. Implementation

V.1 Map architecture to the structure of the project

Overview of the Chosen Architecture

The system adopts a Clean Architecture and Layered Architecture pattern for the backend, combined with a Component Based Architecture for the frontend. The backend is built with NestJS, separating concerns into controllers, services, and data access layers. The frontend utilizes React with Vite, organizing the UI into reusable, state-driven components. 

This architectural style was selected because it directly satisfies key non-functional requirements such as maintainability, scalability, and reusability. By decoupling the business logic from external frameworks, the backend can easily adapt to new database technologies or AI providers. The frontend component structure ensures high reusability of UI elements across different screens, speeding up development and maintaining visual consistency.

Mapping to Project Structure

The actual project folder structure perfectly mirrors the chosen layered architecture. For the backend, the src directory contains a modules folder. Inside modules, each domain like chat, diary, or plant scan has its own isolated structure. For the frontend, the src folder is divided into components for shared UI parts, pages for full view layouts, features for domain specific logic, api for network requests, and store for global state management.

To map each layer to concrete project modules, the controllers folder in the backend represents the Gateway Layer handling HTTP routing and data transfer objects. The services folder contains the Domain Layer executing the core business rules. The common folder houses guards, interceptors, and pipes which act as the Application Layer validating and protecting routes. In the frontend, the api folder acts as the Data Layer, while the components and pages act as the Presentation Layer.

V.2 Map Class Diagram and Interaction Diagram to Code

To demonstrate the implementation of several features using design patterns, we can look at the Plant Scan feature implementation. The interaction begins at the frontend where a user uploads an image. The React component calls an API function defined in the api folder. On the backend, the PlantScanController receives the request and acts as the entry point. It applies a JwtAuthGuard to ensure the user is authenticated. 

The controller then delegates the workload to the PlantScanService. Here, the Dependency Injection pattern is heavily utilized. The PlantScanService injects the LLMService and R2StorageService via its constructor. The service logic first validates the image, uploads it to Cloudflare R2 using the injected storage service, and then calls the LLMService to analyze the plant disease. Finally, it uses a repository pattern via Mongoose models to save the scan result into the database before returning the data object to the client.

VI. Applying Alternative Architecture Patterns

VI.1 Applying the Service-Oriented Architecture (SOA) architecture

Problem Identification

Currently, the system is designed as a monolithic NestJS application. While modules are logically separated, they run within the same Node.js process. This setup struggles to fully support NF-06 Scalability and NF-05 Reusability under heavy load. If the AI processing module experiences a surge in requests, it consumes CPU resources that directly impact the performance of basic CRUD operations like saving a diary entry.

SOA-Based Solution

To resolve this bottleneck, we can redesign the system using a Service-Oriented Architecture. The monolithic backend will be refactored into three independent services. First, the Core Business Service will handle user profiles, diary entries, and pet states. Second, the AI and Vision Service will be a dedicated unit for communicating with the Gemini API, processing RAG queries, and analyzing plant images. Third, the Notification and Scheduler Service will manage background jobs, Zalo messages, and push notifications. These services will communicate via REST or message brokers like BullMQ and Redis.

Supporting Diagrams

In the updated Deployment Diagram, the single backend node is replaced by three separate Docker containers running on independent cloud instances, each with its own scaling rules. The updated Component Diagram shows the API Gateway acting as a central router. Requests for diary data go to the Core Service, while requests for chat or scan are routed to the AI Service. The AI Service and Core Service communicate through a shared Redis message queue to trigger asynchronous notifications in the Notification Service.

VI.2 Applying Service Discovery Pattern in the service-oriented architecture

Problem & Requirement

As we transition to SOA to meet the Scalability requirement (NF-06), a new problem emerges. With multiple instances of the AI Service and Core Service spinning up and down based on traffic, hardcoding IP addresses for inter-service communication becomes impossible. The API Gateway needs a reliable way to locate available service instances dynamically as the system expands across multiple branches and independent modules.

Service Discovery-Based Solution

We will integrate a Service Discovery Pattern using tools like Consul or Kubernetes DNS. When a new instance of the AI Service starts, it registers its IP address and health status with the Service Registry. When the API Gateway needs to route a plant scan request, it queries the Service Registry to find an active AI Service node. This enables horizontal scalability, as new nodes are automatically discovered and traffic is load-balanced across them without manual configuration.

Supporting Diagrams

The updated Deployment Diagram will now include a Service Registry node. Every service container will have a persistent connection to this registry. The updated Component Diagram introduces the Discovery Service component. The API Gateway points to this Discovery Service to resolve service addresses before forwarding HTTP requests, ensuring seamless expansion and fault tolerance across the entire system.
