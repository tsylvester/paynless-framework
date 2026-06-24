# Feature Name
AI Candidate Screening & Interview Generation



## Feature Objective
The primary objective of this feature is to streamline the candidate evaluation process by automatically parsing incoming resumes and ranking them against a specific Job Description. Utilizing advanced LLMs, specifically GPT-4o, the system will intelligently evaluate candidate fit, providing a quantifiable score and a clear, contextual justification for the ranking. Furthermore, to assist hiring teams in subsequent workflow stages, the AI will dynamically generate tailored interview questions based on the candidate's unique resume highlights and potential gaps. This ensures a standardized, objective, and highly efficient screening pipeline that minimizes manual review time.



## User Stories
- As a hiring manager, I want to paste a Job Description so the AI understands the role requirements.
- As a recruiter, I want the system to score and rank resumes 0-100 based on fit.
- As an interviewer, I want the AI to generate 5 specific interview questions based on the candidate's resume gaps or highlights.



## Acceptance Criteria
- System successfully extracts text from PDF and DOCX uploads.
- AI outputs a JSON response containing a score, a 2-sentence justification, and 5 tailored interview questions.
- Processing completes within 15 seconds per resume.



## Dependencies
- OpenAI API (GPT-4o)
- File parsing utility (e.g., pdf2json)
- Cloud storage for resumes (AWS S3 or Supabase Storage)



## Success Metrics
- 99% successful resume parsing rate
- Average AI processing latency < 15 seconds
- User override/correction rate of AI scores < 10%

---

# Feature Name
Team Accounts & Stripe Subscription



## Feature Objective
This feature aims to facilitate seamless collaboration within hiring teams while supporting the platform's core monetization strategy. It introduces multi-user workspaces representing companies or teams, where administrators can easily invite team members and assign role-based access controls to protect sensitive HR data. Additionally, it integrates a frictionless recurring monthly billing system via Stripe. This enables administrators to subscribe to premium tiers that unlock higher AI screening quotas. A robust webhook infrastructure will guarantee that team subscription statuses are updated instantaneously based on payment events, ensuring an uninterrupted SaaS experience.



## User Stories
- As an admin, I want to invite my team members so we can collaborate on hiring.
- As an admin, I want to subscribe via Stripe to unlock premium AI screening limits.



## Acceptance Criteria
- Role-based access control (Admin vs Member).
- Stripe Checkout integration for subscription initiation.
- Webhook handler to update team tier based on Stripe payment status.



## Dependencies
- Stripe API
- Authentication Provider (Supabase Auth)



## Success Metrics
- 100% accurate webhook processing
- Zero cross-tenant data leaks