# From One-Shot Plan to Continuous Workflow

## 1. Introduction: A Philosophical Shift

This document outlines a fundamental strategic evolution in the application's design philosophy. We are moving away from the concept of generating a single, monolithic, "one-shot" implementation plan. Instead, we are embracing an iterative, cyclical, and agile workflow that positions our tool as an ongoing partner in the software development lifecycle.

This shift is driven by a synthesis of technical constraints, user-centric design principles, and a long-term business vision.

### 1.1. The Rationale: Turning Limitations into Strengths

*   **Technical Constraints:** Large-language models have practical context window limitations. Attempting to generate and edit a single, comprehensive plan for a large application will inevitably hit these limits, degrading the quality and detail of the output. By chunking the work, we allow the AI to dedicate its full context window to providing a high-detail plan for the immediate work, resulting in a higher quality output.

*   **User-Centric Design:** A monolithic plan is overwhelming and rigid. A continuous, iterative process aligns with modern agile methodologies like "rolling wave planning," empowers developers by reducing cognitive load, and provides a more valuable and engaging user experience. We are turning a technical limitation into a powerful product feature that guides users toward a better development process.

*   **Business Vision:** An iterative model transforms the application from a tool used once at the start of a project into an indispensable platform for an ongoing partnership. This creates a powerful retention loop, providing continuous value at every stage of the development lifecycle and building "stickiness" for the product.

### 2. The Continuous Workflow Cycle & The Power of Choice

The user journey is transformed from a linear pipeline into a virtuous cycle. A user returns to the application at the completion of each sprint to generate the detailed plan for their next phase of work. This cycle is capped not by a prescriptive final answer, but by an empowered choice.

#### 2.1. The Dialectic Stages, Reframed for Iteration

*   **Thesis Stage:**
    *   **Input:** A high-level goal for the user's immediate needs—either the initial project idea or a milestone from a previously generated "Master Plan."
    *   **Output:** Conceptual artifacts (PRDs, business cases, user stories) to establish a shared understanding.

*   **Antithesis Stage:**
    *   **Input:** The collection of model-generated Theses and any user feedback.
    *   **Output:** Critical analysis to identify gaps, fix blind spots, and refine initial concepts.

*   **Synthesis Stage**
    *   **Input:** The complete context of the user's prompt, the Theses, and the Antitheses.
    *   **Output:** A set of synthesized, draft implementation plans that are fitness-checked against the original request, along with updated business cases and user stories.

*   **Parenthesis Stage:**
    *   **Input:** The synthesized implementation plans.
    *   **Output:** A single, unified "Master Plan" for the entire project. This plan is structured as a high-level checklist of sprints or epics. It outlines all the work required to satisfy the Synthesis artifacts but does not yet contain low-level detail.

*   **Paralysis Stage**
    *   **Input:** The high-level "Master Plan" created in the Parenthesis stage.
    *   **Output:** This stage produces two critical, distinct deliverables:
        1.  **The Actionable Checklist:** A dependency-ordered, comprehensively detailed, low-level implementation plan for the *first one or two* milestones from the Master Plan. This is the user's work for their next immediate sprint.
        2.  **The Updated Master Plan:** The complete Master Plan is returned, but with the milestones that were just detailed in the Actionable Checklist now marked as `[🚧]` (in progress).

#### 2.2. The Capstone: The Advisor Stage

Critically, the process culminates in user empowerment. Instead of an "Arbiter" model that generates a single, final plan, the **Advisor Stage** provides a capstone experience.

*   **Input:** The multiple versions of the "Actionable Checklist" and "Updated Master Plan" from the Paralysis stage (one from each model).
*   **Output:** A concise executive summary that compares the different generated plans.

This summary delivers actionable wisdom, not just raw data, by highlighting:
*   **Key Differences & Philosophies:** e.g., "Plan A prioritizes microservices, while Plan B uses a modular monolith."
*   **Strengths & Trade-offs:** e.g., "Plan A is more scalable but complex; Plan B is faster to start."
*   **Points of Agreement:** e.g., "All plans recommend using PostgreSQL and React."

This approach honors the user's agency, leverages the "IKEA Effect" by making them the final decision-maker, and provides a tangible, valuable "meta-artifact" that justifies the entire multi-agent process.

### 3. The Engine of Continuity: The Master Plan

The key to this entire workflow is the **Master Plan**. It is the single source of truth that makes the iterative cycle intelligent.

*   **Preserves Global Context:** By maintaining a persistent, high-level plan where completed work is marked off (`[✅]`), we provide the AI with the project's history. When generating the plan for "Milestone 7," it knows that "Milestones 1-6" are complete, allowing it to infer the existence of previously built components and create smarter, more consistent plans.
*   **Enables the Ecosystem:** This "Master Plan" is the ideal artifact for integration with sibling tools, such as bi-directional sync with project management platforms like Jira. Its structure allows for clean mapping of high-level epics, something a depleting to-do list would make nearly impossible.

### 4. Implementation via Data-Driven Prompting

This iterative workflow will be implemented by leveraging the data-driven prompting architecture defined in `AI Dialectic Implementation Plan Phase 2.md`, Section 2.Z. The `system_prompts` and `expected_output_artifacts` for the `Parenthesis` and `Paralysis` stages will be specifically engineered to instruct the AI to:
1.  First, create the high-level Master Plan (Parenthesis).
2.  Then, detail only the next uncompleted milestone(s) while simultaneously returning the updated Master Plan (Paralysis).

This ensures the AI's output is always structured to fuel the next iteration of the continuous workflow, cementing the application's role as an indispensable planning partner.
