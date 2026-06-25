Paynless is an AI driven document generator to help clearly define application requirements and development processes from sparse input. 

Its main feature is the Project function. The Project function follows the five-step pre-development processes common at major software development firms: 
* Proposal
* Review
* Refinement
* Planning
* Implementation

A Project is designed as a "dialectic", or a discussion among experts. This is like how a traditional software development process would have experts in every topic that would discuss the best way to perform the proposed work, and negotiate a mutually agreed path that synthesizes input from experts in different fields. 

Users may choose one or more agents to perform the work. The app assumes that multiple agents will be chosen, so that the agents can negotiate against each other to identify better solutions and produce improvements against each agent's proposals, reviews, refinements, and plans. The idea is that each agent will have its own perspective, strengths, and weaknesses, and can recognize when another agent's approach is superior. The agents then iteratively consume each other's documents to respond to them and attempt to improve on each others' work. 

While users are suggested to use 2-3 agents, the app works fine with only a single agent chosen. It is not suggested to use more than 3 agents because the intermediate stages (Review and Refinement) have an exponential growth of documents generated (n^2 and n^3) that can make projects extremely expensive if more than 3 agents are chosen. 

The Proposal stage is each agent attempting to propose
* A justifiable business case for why the application would be developed 
* General specifications for the features the application would require 
* How to measure whether the application development is successful
* What technical approach should be adopted to deliver the business case against the feature specs to reach the success metrics. 

The Review stage is each agents' criticism of each agents' original Proposal. The agents produce: 
* A critique of the business case - what was wrong with it, what was missing, what was overly optimistic
* A dependency map that explains how the components of the application would rely on each other
* Non-functional requirements that constrain the solution against real world concerns like security and scalability 
* A risk register that explains everything that can go wrong with the application or its development
* A summary of the technical feasibility of delivering the aplication 

The Refinement stage is each agents' synthesis of each Proposal and Review. Each agent produces: 
* A product requirements document that explains what must actually be built 
* A system architecture that documents how the components of the must be designed and work together
* A description of the proposed tech stack to implement the system architecture while delivering the product requirements

The Planning stage is a fan-in stage that takes the products of the Proposal, Review, and Refinement stages and collapses them into a single workstream for each agent. 

In the Planning stage each agent begins to explain how they think the user could actually build the app: 
* A master plan to follow that shows the starting point and the proposed end point that delivers the original objective
* The milestones between the starting point and end point 
* The technical requirements for delivering the milestones of the master plan to achieve the user's stated application objective

The Implementation stage is the final stage. Each agent produces: 
* A work plan that explains how to implement the first milestones from the master plan 
* Recommendations for which agents' project path to follow - the agents do not know "who wrote what" so their recommendation is blind to whether they or another agent wrote the documents
* An updated master plan that assumes that the user is going to complete the milestones detailed in the prior stage and modifies the master plan to reflect the subsequent steps once the currently detailed steps are completed

The Implementation stage only details the first few milestones of the master plan. Future versions of the app will include an iterator that will repeatedly run the implementation stage to increment the project along the entire master plan, from milestone to milestone, until all milestones are completed and the app is completed according to its original specifications. 

A Project is created when the user inputs their application objective into the Project chat box and submits it. 

"Autostart" automatically configures the project using typical settings and submits the project request to the default agent. The user can select additional agents before beginning the project. 

Some of the documents include "Open Questions" that the user is recommended to answer. If the user does not answer, the agent will attempt to answer on behalf of the user. 

The user may edit each document to modify the agent's suggestions or provide feedback for clarifications or opinions on the agent's suggestions. 

Each stage includes multiple local and agent-call steps. The application does not currently provide complete status/progress updates on background tasks to the user. The user should give each stage 10-15 minutes to complete before assuming it's not working. 

After each stage, when the user submits their edited documents or feedback, the application advances to the next stage and, if the user has sufficient tokens, begins running the stage. 

For each stage, the user is encouraged to answer all Open Questions, edit the agents' documents to match the user's actual preferences, and/or submit feedback that the agents will use to revise their work in the next stage. 

The documents are roughly organized into groups for Executive, Management, and Development. The Executive documents explain the business logic for building the app. The Management documents explain the process logic and metrics. The Development documents explain the technical requirements and actual work steps to deliver the Management and Executive objectives.  

Currently the Project concludes when a user reaches the Implementation stage. From there, the set of documents may be consumed by a development team, populated into a repo for a swarm of AI agents to build, populated into an IDE for CLI agents to build (like Cursor, Devin, Copilot, Claude Code, or Codex) or input into an application development platform (like Lovable, Bolt, Replit, or v0). 

The application provides a Chat interface. Each document in the Project flow is built from a Persona. Users can chat with each Persona about the choices in each document if desired. 

Paynless provides multi-tenant and organization management features. Users subscribe to specific access tiers that gate what agents they can access, the token budget for each document, and how many agents they can run on a project. Tokens are purchased separately through one-time purchase top-ups. 

Paynless uses the following stack, organized into multiple workspaces: 
- pnpm 10 monorepo
- Typescript 
- Node 20
- API 
- Zustand store 
- User analytics and campaign plugins (Kit, Posthog)
- Platform manager for various front ends: 
-- Typescript/Vite/Vitest web app
-- React primitives for Android and iOS
-- Tauri/Rust for Windows
- Supabase Postgres database and Deno edge functions
- Netlify async-workloads for long-lived agent calls (Vite/Vitest)
- Playwright for e2e testing (not completely set up yet)

Nearly all functions have unit tests and many have integration tests. Currently around 85% of unit and integration tests pass. Most failures are outdated integration tests or unit tests whose mocks no longer match the type contract. Type mocks are slowly being moved to factories so they stay current. 

To install locally,
- nvm use 20
- pnpm use 10
- install Supabase CLI and Netlify CLI 
-- Supabase dev requires Docker to be installed locally 
-- Netlify requires the `@netlify/async-workloads` extension to be enabled at `app.netlify.com` for your project and installed locally to your project dev workspace
- Login to and link your Supabase and Netlify accounts to your repo, e.g. `supabase link`, `netlify login`, `netlify link` 
- `pnpm install` 
- Launch the dev servers by running `pnpm dev` 
-- This uses `concurrently` to launch `supabase functions serve`, `web dev`, and `netlify dev` simultaneously
- in each workspace, you may need to run `pnpm install` if `pnpm dev` doesn't immediately work
