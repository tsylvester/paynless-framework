# Optimized Dialectic Prompt System

## Core Template Structure

### Base Template Variables
- `{domain}` - The knowledge domain (software development, finance, engineering, legal)
- `{user_objective}` - The specific goal or problem to solve
- `{context_description}` - Detailed description of the current situation/requirements
- `{deployment_context}` - Where/how the solution will be implemented
- `{domain_standards}` - Domain-specific quality standards and best practices
- `{deliverable_format}` - Expected output format (code, document, plan, etc.)
- `{success_criteria}` - Measurable outcomes that define success
- `{constraint_boundaries}` - Non-negotiable requirements and limitations
- `{stakeholder_considerations}` - Who will be affected and how
- `{reference_documents}` - User-provided reference materials and existing assets
- `{compliance_requirements}` - Regulatory, legal, or organizational compliance mandates
- `{agent_count}` - Number of agents participating in this dialectic process
- `{prior_stage_outputs}` - All outputs from the previous dialectic stage (multiple versions)

---

## Stage 1: Thesis (Expansive Generation)

### Base Template

We're developing a comprehensive solution for {user_objective} in the {domain} domain.

**Dialectic Process Context:**
You are one of {agent_count} agents participating in a collaborative dialectic process. This is the initial Thesis stage where each agent will independently develop a comprehensive solution approach. Your output will be combined with {agent_count - 1} other thesis proposals in subsequent stages to create a robust, multi-perspective solution.

**Context:**
{context_description}

**Deployment Environment:**
{deployment_context}

**Reference Materials:**
You have been provided with the following reference documents that must be considered and integrated into your solution:
{reference_documents}

These materials represent existing assets, standards, constraints, or requirements that your solution must accommodate, leverage, or comply with. Ensure your approach:
- Builds upon existing assets rather than duplicating effort
- Maintains compatibility with established systems
- Adheres to documented standards and procedures
- Respects organizational constraints and preferences

**Your Task:**
Create a detailed implementation plan that addresses this objective using {domain_standards} best practices. Your solution should be:
- Safe and secure
- Reliable and performant
- Sophisticated yet maintainable
- Scalable and extensible
- Modular and well-architected

**Unique Perspective Requirement:**
Since your output will be braided with other agents' thesis proposals, focus on developing a distinctive approach that:
- Offers unique insights or methodologies
- Explores different architectural patterns or strategies
- Considers alternative risk/benefit trade-offs
- Brings different domain expertise to bear on the problem
- Provides complementary perspectives to potential alternative approaches

**Deliverables:**
1. Executive summary of your approach
2. Detailed implementation strategy
3. Step-by-step development checklist
4. Risk assessment and mitigation strategies
5. Success metrics aligned with {success_criteria}

**Quality Standards:**
- Address all aspects of {constraint_boundaries}
- Consider impact on {stakeholder_considerations}
- Ensure deliverable meets {deliverable_format} requirements
- Integrate and build upon {reference_documents}
- Comply with {compliance_requirements}

Think comprehensively. Be verbose and explanatory. Document every relevant aspect without omitting critical details.

**Validation Checkpoint:**
Before proceeding, verify your solution addresses:
□ All stated requirements
□ Domain-specific best practices
□ Stakeholder needs
□ Technical feasibility
□ Resource constraints
□ Integration with existing reference materials
□ Compliance with provided standards and procedures
□ Offers a distinctive perspective that will complement other approaches

### Domain-Specific Overlays

#### Software Development
```
{domain} = software development
{domain_standards} = clean code principles, SOLID design patterns, test-driven development, security-first architecture, CI/CD best practices
{reference_documents} = existing system architecture, API documentation, database schemas, coding standards, deployment configurations, security policies
{compliance_requirements} = security standards (SOC2, ISO 27001), accessibility guidelines (WCAG), data protection regulations (GDPR, CCPA)
Additional considerations:
- Code maintainability and documentation
- Performance optimization strategies
- Security vulnerability assessment
- Scalability architecture patterns
- Integration testing strategies
```

#### Finance
```
{domain} = financial analysis and management
{domain_standards} = regulatory compliance (SEC, FINRA, SOX), risk management frameworks, fiduciary responsibility, audit trails, data security
{reference_documents} = existing financial models, budget constraints, regulatory filings, audit reports, risk assessments, compliance procedures
{compliance_requirements} = SEC regulations, FINRA rules, SOX compliance, AML requirements, tax code adherence
Additional considerations:
- Regulatory compliance requirements
- Risk assessment methodologies
- Financial modeling accuracy
- Audit trail maintenance
- Stakeholder reporting obligations
```

#### Engineering/Construction
```
{domain} = engineering and construction
{domain_standards} = safety regulations, building codes, environmental compliance, project management best practices, quality assurance protocols
{reference_documents} = site surveys, architectural drawings, soil reports, environmental assessments, permit applications, material specifications
{compliance_requirements} = building codes, zoning regulations, environmental protection standards, OSHA safety requirements, local permits
Additional considerations:
- Safety protocol adherence
- Environmental impact assessment
- Resource allocation optimization
- Timeline and milestone management
- Quality control checkpoints
```

#### Legal
```
{domain} = legal practice and document management
{domain_standards} = attorney-client privilege, ethical guidelines, procedural compliance, evidence handling, confidentiality protocols
{reference_documents} = existing contracts, case law precedents, regulatory guidance, court rules, client files, organizational policies
{compliance_requirements} = bar association rules, court procedures, confidentiality requirements, conflict of interest policies, billing regulations
Additional considerations:
- Ethical obligation compliance
- Procedural rule adherence
- Confidentiality maintenance
- Evidence chain of custody
- Client communication protocols
```

---

## Stage 2: Antithesis (Critical Analysis)

### Base Template

**Critical Analysis Task:**
Thoroughly critique all attached {domain} implementation plans with expert-level scrutiny.

**Dialectic Process Context:**
You are participating in a braided dialectic process. You have been provided with {agent_count} different thesis proposals from the previous stage. Each represents a different approach to solving {user_objective}. Your task is to provide comprehensive critical analysis that examines ALL proposals collectively and individually.

**Multi-Perspective Analysis Framework:**
You must analyze:
1. **Individual Plan Critiques**: Detailed analysis of each thesis proposal's strengths and weaknesses
2. **Comparative Assessment**: How the different approaches compare, contrast, and potentially conflict
3. **Gap Analysis**: What important aspects are missed across ALL proposals
4. **Integration Challenges**: Where combining elements from different proposals might create conflicts
5. **Collective Blind Spots**: Assumptions or risks that appear across multiple or all proposals

**Reference Context:**
You have access to the following reference materials that inform your analysis:
{reference_documents}

Use these materials to:
- Verify alignment with existing systems and standards across all proposals
- Identify compatibility issues or integration challenges in each approach
- Assess whether proposals leverage existing assets effectively
- Check compliance with documented procedures and requirements

**Your Expertise:**
You are a seasoned {domain} professional with deep knowledge of {domain_standards} and extensive experience identifying project failure points.

**Analysis Framework:**
For each thesis proposal, examine:
1. **Technical Accuracy**: Identify factual errors, outdated practices, or misapplied concepts
2. **Risk Assessment**: Highlight overlooked risks, vulnerabilities, or failure modes
3. **Best Practice Compliance**: Compare against {domain_standards} and identify gaps
4. **Stakeholder Impact**: Assess potential negative effects on {stakeholder_considerations}
5. **Resource Realism**: Evaluate feasibility given typical constraints
6. **Scalability Concerns**: Identify limitations that could impede growth or adaptation

**Cross-Proposal Analysis:**
Additionally, assess:
- **Conflicting Approaches**: Where proposals contradict each other and why
- **Complementary Elements**: Which aspects from different proposals could be combined effectively
- **Consensus Patterns**: What approaches or principles appear consistently across proposals
- **Coverage Gaps**: What critical aspects are inadequately addressed across all proposals
- **Resource Conflicts**: Where different proposals would compete for the same resources

**Critical Examination Areas:**
- Are all {constraint_boundaries} properly addressed across proposals?
- Do the solutions meet {success_criteria} comprehensively?
- Are there hidden dependencies or circular logic in any approach?
- What assumptions lack validation across the proposals?
- Where might implementation fail under stress?
- How well do the proposals integrate with {reference_documents}?
- Are there conflicts with existing systems or procedures?
- Do the plans comply with {compliance_requirements}?

**Your Deliverable:**
Create a comprehensive critique that includes:
1. **Executive Summary**: Overview of critical findings across all proposals
2. **Individual Plan Analysis**: Detailed critique of each thesis proposal
3. **Comparative Analysis**: Strengths/weaknesses comparison between approaches
4. **Integration Assessment**: Evaluation of how elements might be combined
5. **Collective Risk Assessment**: Risks that span multiple approaches
6. **Specific Recommendations**: Improvements for each individual proposal
7. **Synthesis Guidance**: Recommendations for how to best combine elements in the next stage

**Quality Gate:**
Your critique should be so thorough that following your recommendations would result in significantly more robust, reliable, and successful implementation options.

**Validation Checkpoint:**
Ensure your critique addresses:
□ All major technical concerns across all proposals
□ Risk mitigation strategies for each approach
□ Alternative solution approaches where applicable
□ Resource requirement adjustments for each proposal
□ Timeline impact assessment across approaches
□ Integration with existing reference materials for all proposals
□ Compliance with documented standards across all approaches
□ Compatibility with current systems and procedures for each proposal
□ Clear guidance for synthesis of multiple perspectives

---

## Stage 3: Synthesis (Integration & Resolution)

### Base Template

**Synthesis Objective:**
Integrate multiple thesis proposals with comprehensive critical analyses to create an optimized, unified solution for {user_objective}.

**Dialectic Process Context:**
You are working with outputs from a braided dialectic process where {agent_count} agents developed different approaches, and each approach was critiqued by multiple analysts. You must now weave together the strongest elements from all perspectives into a single, superior solution.

**Integration Framework:**
You have access to:
1. **Multiple Thesis Proposals**: {agent_count} different implementation approaches from the initial stage
2. **Comprehensive Critiques**: Multiple critical analyses examining each proposal and their interactions
3. **Domain standards**: {domain_standards}
4. **Success criteria**: {success_criteria}
5. **Constraint boundaries**: {constraint_boundaries}
6. **Reference documents**: {reference_documents}
7. **Compliance requirements**: {compliance_requirements}

**Multi-Perspective Synthesis Process:**

**1. Comparative Analysis:**
- Identify the strongest elements from each thesis proposal
- Map where different approaches complement vs. conflict with each other
- Determine which critiques apply to individual proposals vs. systemic issues
- Assess which combination of approaches best serves {stakeholder_considerations}

**2. Conflict Resolution:**
- Where thesis proposals contradict each other, determine the optimal approach based on:
  * Alignment with {success_criteria}
  * Compliance with {constraint_boundaries}
  * Integration with {reference_documents}
  * Risk mitigation effectiveness
  * Resource efficiency
- Address criticisms that apply across multiple proposals
- Resolve tensions between competing priorities or methodologies

**3. Gap Integration:**
- Address areas inadequately covered by any individual proposal
- Incorporate insights from critiques that highlight missing elements
- Ensure comprehensive coverage of all requirements and stakeholder needs
- Fill integration gaps between different proposal elements

**4. Optimization:**
- Combine complementary strengths from different approaches
- Eliminate redundancies where proposals overlap
- Streamline processes where multiple proposals suggest similar solutions
- Enhance efficiency while maintaining robustness

**Your Task:**
Create a unified, superior solution that:
- Preserves the best elements from all thesis proposals
- Addresses all valid criticisms from the analyses
- Resolves conflicts between competing approaches through principled decision-making
- Optimizes for {success_criteria} while respecting {constraint_boundaries}
- Leverages existing assets documented in {reference_documents}
- Ensures full compliance with {compliance_requirements}
- Creates synergies between different approaches where possible

**Synthesis Process:**
1. **Element Evaluation**: Score and compare key elements from each proposal
2. **Conflict Resolution**: Make principled decisions where approaches disagree
3. **Gap Filling**: Address areas missed by individual proposals
4. **Integration Planning**: Ensure chosen elements work together harmoniously
5. **Risk Consolidation**: Create comprehensive risk mitigation drawing from all analyses
6. **Stakeholder Optimization**: Ensure solution serves all {stakeholder_considerations} effectively

**Deliverables:**
1. **Enhanced Product Requirements Document**: Unified vision incorporating best elements
2. **Comprehensive Implementation Checklist**: Dependency-ordered, drawing from all proposals
3. **Consolidated Risk Mitigation Strategies**: Addressing all identified concerns
4. **Integrated Success Metrics**: Validation criteria incorporating all perspectives
5. **Unified Resource Requirements**: Realistic timeline and resource allocation
6. **Synthesis Rationale**: Documentation of key decisions and why alternatives were rejected

**Quality Standards:**
- Solution must be implementable following the checklist in order
- Each step must have clear inputs, processes, and outputs
- Include specific validation criteria for each milestone
- Address scalability and maintainability concerns from all proposals
- Provide fallback strategies for high-risk elements identified in any critique
- Demonstrate clear superiority over any individual thesis proposal

**Validation Checkpoint:**
Verify the synthesized solution:
□ Addresses all original requirements comprehensively
□ Incorporates critical feedback from all analyses
□ Maintains technical feasibility across all integrated elements
□ Serves all stakeholder needs identified across proposals
□ Provides clear, unified implementation path
□ Leverages existing reference materials more effectively than individual proposals
□ Maintains compliance with all documented requirements
□ Resolves conflicts between proposals through documented rationale
□ Creates positive synergies between different approaches

---

## Stage 4: Parenthesis (Formalization & Refinement)

### Base Template

**Formalization Objective:**
Transform the synthesized solution (which integrated multiple thesis proposals and their critiques) into a production-ready implementation plan with rigorous detail and formal structure.

**Dialectic Process Context:**
You are working with a solution that represents the best elements from {agent_count} different thesis approaches, refined through comprehensive critical analysis and intelligently synthesized. Your task is to formalize this multi-perspective solution into an executable implementation plan.

**Multi-Source Integration Context:**
The synthesized solution you're formalizing incorporates:
- Strongest elements from {agent_count} different thesis proposals
- Resolution of conflicts between competing approaches  
- Responses to critiques that identified gaps and risks across all original proposals
- Optimizations that create synergies between different methodological approaches

**Current State Assessment:**
{deployment_context}

**Reference Materials Integration:**
You must incorporate and build upon the following existing assets and documentation:
{reference_documents}

These materials define:
- Existing systems that must be preserved or integrated with
- Established standards and procedures that must be followed
- Available resources and constraints that shape implementation
- Compliance requirements that cannot be violated
- Organizational preferences and approved methodologies

**Governing Standards:**
You must strictly adhere to:
- Domain standards: {domain_standards}
- Success criteria: {success_criteria}
- Constraint boundaries: {constraint_boundaries}
- Stakeholder requirements: {stakeholder_considerations}
- Reference documentation: {reference_documents}
- Compliance mandates: {compliance_requirements}

**Formalization Requirements:**

1. **Dependency Ordering**: Create a strictly sequential implementation path where each step builds on completed prior work, accounting for the complexity of the multi-source synthesis
2. **Granular Detail**: Break complex synthesized tasks into atomic, unambiguous actions
3. **Quality Gates**: Define specific validation criteria for each major milestone, incorporating validation approaches from multiple original proposals
4. **Resource Specification**: Detail exact requirements (time, expertise, tools, budget) based on realistic assessment of the synthesized approach
5. **Risk Mitigation**: Embed safeguards and contingency plans addressing risks identified across all original proposals

**Multi-Perspective Formalization Considerations:**
- **Approach Integration**: Ensure steps properly sequence elements drawn from different thesis proposals
- **Conflict Resolution Documentation**: Where synthesis chose between competing approaches, document the rationale and ensure implementation steps reflect those decisions
- **Synergy Realization**: Structure implementation to capture positive interactions between elements from different proposals
- **Comprehensive Coverage**: Ensure formalization addresses all aspects identified across the full spectrum of original proposals

**Expected Deliverable Format:**
{deliverable_format}

**Implementation Plan Structure:**
1. **Executive Summary**: Clear statement of objectives and unified approach
2. **Synthesis Summary**: Brief explanation of how multiple approaches were integrated
3. **Prerequisites**: What must exist before implementation begins
4. **Phase-by-Phase Breakdown**: Logical groupings of related work from the synthesized solution
5. **Detailed Checklist**: Step-by-step instructions for primary implementation phase
6. **Quality Assurance Protocol**: Validation steps and acceptance criteria incorporating multiple validation approaches
7. **Comprehensive Risk Management**: Identified risks with specific mitigation strategies from all source analyses
8. **Integrated Success Metrics**: Measurable outcomes aligned with {success_criteria} and drawing from all proposals

**Checklist Item Standards:**
Each checklist item must:
- Be implementable by a skilled practitioner following the instructions
- Have clear inputs (what you need to start)
- Have clear outputs (what you produce)
- Include validation criteria (how you know it's done correctly)
- Reference relevant standards or guidelines
- Specify any tools or resources required
- Account for the multi-source nature of the synthesized solution
- Indicate where steps derive from specific original proposals when relevant for context

**Quality Gate Validation:**
Before proceeding, ensure:
□ Implementation path has no dependency gaps despite multi-source integration
□ Each step is atomic and unambiguous
□ Validation criteria are measurable and comprehensive
□ Risk mitigation is embedded throughout, addressing concerns from all original analyses
□ Resource requirements are realistic for the synthesized approach
□ Timeline accounts for quality assurance across all integrated elements
□ Integration with existing systems is planned comprehensively
□ Compliance requirements are addressed at each step
□ Reference materials are appropriately leveraged throughout
□ Synthesis decisions are properly reflected in implementation steps
□ Synergies between different approaches are captured in the implementation sequence

---

## Stage 5: Paralysis (Reflection & Iteration Assessment)

### Base Template

**Reflection Objective:**
Conduct a comprehensive assessment of the formalized implementation plan (derived from multiple synthesized perspectives) and determine optimal path forward.

**Dialectic Process Context:**
You are evaluating the culmination of a braided dialectic process that began with {agent_count} different thesis approaches, subjected them to comprehensive critical analysis, synthesized the best elements into a unified solution, and formalized that synthesis into an executable plan. Your assessment must consider this multi-perspective heritage.

**Multi-Source Solution Assessment:**
The implementation plan you're evaluating represents:
- Integration of {agent_count} different thesis approaches
- Resolution of conflicts and contradictions between methodologies
- Incorporation of critical insights from comprehensive analyses
- Synthesis optimization that created synergies between approaches
- Formalization that maintains the multi-perspective advantages

**Assessment Framework:**
Evaluate the complete dialectic process and its output against all provided context:

**Reference Materials Validation:**
First, assess how well the solution integrates with {reference_documents}:
- Are existing assets properly leveraged rather than duplicated?
- Does the plan maintain compatibility with current systems?
- Are documented standards and procedures followed consistently?
- Have organizational constraints been respected?
- Is there proper compliance with {compliance_requirements}?

**1. Solution Quality Analysis**
   - Does the final plan adequately address {user_objective}?
   - Are {success_criteria} achievable following this plan?
   - Do the proposed methods align with {domain_standards}?
   - Are {constraint_boundaries} properly respected?
   - **Multi-Perspective Evaluation**: Does the synthesized solution demonstrate clear advantages over any individual thesis proposal?

**2. Implementation Feasibility Review**
   - Is the dependency ordering correct and complete, accounting for the integrated nature of the solution?
   - Are resource requirements realistic and available for the synthesized approach?
   - Is the timeline achievable given the complexity of the multi-source solution?
   - Are quality gates sufficient to ensure success across all integrated elements?
   - **Integration Complexity**: Are there hidden complexities from combining different approaches?

**3. Risk Assessment Validation**
   - Have all significant risks been identified and addressed across all original proposals?
   - Are mitigation strategies practical and effective for the synthesized solution?
   - What failure modes remain unaddressed despite the comprehensive multi-perspective analysis?
   - Are contingency plans adequate for the increased complexity of the integrated approach?
   - **Synthesis Risks**: Are there new risks created by combining different methodologies?

**4. Stakeholder Impact Evaluation**
   - How well does the solution serve {stakeholder_considerations}?
   - Are there unintended consequences for any stakeholder group from the synthesized approach?
   - Does the plan account for change management needs given the comprehensive solution?
   - Are communication and training requirements addressed across all integrated elements?

**5. Multi-Perspective Value Assessment**
   - **Synergy Realization**: Are the predicted synergies between different approaches actually achievable?
   - **Conflict Resolution Quality**: Were conflicts between approaches resolved optimally?
   - **Coverage Completeness**: Does the synthesized solution address aspects missed by individual proposals?
   - **Integration Elegance**: Is the combination of approaches elegant and maintainable, or overly complex?

**Critical Questions:**
- What aspects of the synthesized plan remain unclear or ambiguous?
- Where might implementation stall due to the complexity of integrated approaches?
- What assumptions in the multi-source plan lack sufficient validation?
- How could the approach be simplified without losing the advantages of synthesis?
- What external dependencies could derail the integrated project?
- **Synthesis-Specific**: Are there aspects where the synthesis created unnecessary complexity compared to simpler individual approaches?

**Iteration Recommendation Framework:**
Based on your comprehensive assessment, recommend one of the following:

**Option A: Proceed with Implementation**
If the synthesized plan is comprehensive, feasible, and demonstrates clear advantages:
- Confirm readiness for implementation of the integrated solution
- Highlight key success factors specific to the multi-perspective approach
- Identify critical path items requiring extra attention due to synthesis complexity
- Suggest implementation team structure that can handle the integrated methodology

**Option B: Focused Refinement Required**
If specific areas need improvement but overall synthesized approach is sound:
- Identify exact areas requiring additional work
- Specify what type of refinement is needed (individual elements vs. integration points)
- Suggest whether refinement should focus on specific original proposals or synthesis decisions
- Provide guidance for targeted improvements without losing multi-perspective advantages

**Option C: Partial Re-synthesis Needed**
If integration of certain approaches creates problems but core synthesis is valuable:
- Identify which integrated elements are problematic
- Suggest alternative ways to combine the strong proposals
- Recommend revisiting specific synthesis decisions
- Provide guidance for re-synthesis of particular aspects

**Option D: Fundamental Redesign Needed**
If the synthesis approach has significant flaws requiring major revision:
- Identify fundamental issues with the synthesized approach
- Assess whether problems stem from individual proposals or synthesis methodology
- Suggest alternative framing of the problem or synthesis approaches
- Recommend starting fresh with modified requirements or different proposal selection

**Final Deliverable:**
1. **Executive Assessment**: Overall quality and readiness evaluation of the synthesized solution
2. **Multi-Perspective Value Analysis**: Assessment of whether synthesis achieved superior results
3. **Detailed Findings**: Specific strengths and weaknesses of the integrated approach
4. **Implementation Readiness Report**: Go/no-go recommendation with synthesis-specific reasoning
5. **Integration Quality Assessment**: Evaluation of how well different approaches were combined
6. **Next Steps Guidance**: Specific actions based on your recommendation
7. **Synthesis Lessons Learned**: Insights for improving future multi-perspective dialectic processes
8. **Success Probability Estimate**: Realistic assessment of likely outcomes for the integrated solution

**Validation Checkpoint:**
Ensure your reflection addresses:
□ Solution completeness and accuracy across all integrated elements
□ Implementation feasibility of the synthesized approach
□ Risk adequacy for the multi-perspective solution
□ Stakeholder satisfaction with the integrated approach
□ Clear recommendation with synthesis-specific rationale
□ Integration with existing reference materials across all solution components
□ Compliance with all documented requirements throughout the synthesized plan
□ Preservation of valuable existing assets in the integrated solution
□ Assessment of whether multi-perspective synthesis delivered superior value
□ Evaluation of integration complexity vs. individual approach simplicity
□ Quality of conflict resolution between different methodological approaches

---

## Domain-Specific Validation Overlays

### Software Development Quality Gates

**Code Quality:**
□ Follows clean code principles
□ Includes comprehensive test coverage
□ Implements proper error handling
□ Uses appropriate design patterns
□ Maintains security best practices

**Architecture:**
□ Scalable and maintainable design
□ Proper separation of concerns
□ Database design optimization
□ API design consistency
□ Performance consideration

**Integration:**
□ Compatible with existing system architecture
□ Leverages current APIs and services appropriately
□ Maintains data consistency across systems
□ Follows established coding standards
□ Integrates with existing deployment pipelines

**Process:**
□ CI/CD pipeline defined
□ Code review process established
□ Documentation requirements met
□ Deployment strategy validated
□ Monitoring and logging planned

### Finance Quality Gates

**Regulatory Compliance:**
□ All applicable regulations identified
□ Compliance procedures documented
□ Audit trail mechanisms established
□ Reporting requirements addressed
□ Risk management protocols defined

**Financial Accuracy:**
□ Calculation methods validated
□ Data sources verified
□ Error handling procedures defined
□ Reconciliation processes established
□ Performance metrics aligned with standards

**Integration:**
□ Compatible with existing financial systems
□ Leverages current data models appropriately
□ Maintains audit trail continuity
□ Follows established reporting formats
□ Integrates with compliance monitoring tools

**Risk Management:**
□ Risk assessment completed
□ Mitigation strategies defined
□ Monitoring systems planned
□ Escalation procedures established
□ Contingency planning documented

### Engineering/Construction Quality Gates

**Safety and Compliance:**
□ Safety protocols established
□ Building codes compliance verified
□ Environmental impact assessed
□ Permit requirements identified
□ Inspection schedules planned

**Technical Standards:**
□ Engineering specifications validated
□ Material requirements documented
□ Testing procedures defined
□ Performance criteria established
□ Maintenance requirements planned

**Integration:**
□ Compatible with existing site conditions
□ Leverages current infrastructure appropriately
□ Maintains structural integrity standards
□ Follows established construction procedures
□ Integrates with existing utilities and systems

**Project Management:**
□ Resource allocation optimized
□ Timeline dependencies mapped
□ Quality control checkpoints defined
□ Communication protocols established
□ Change management procedures documented

### Legal Quality Gates

**Ethical and Professional Standards:**
□ Ethical obligations identified
□ Confidentiality protocols established
□ Conflict of interest assessment completed
□ Professional responsibility requirements met
□ Client communication standards defined

**Procedural Compliance:**
□ Applicable rules and procedures identified
□ Filing requirements documented
□ Deadline management systems established
□ Evidence handling procedures defined
□ Case management protocols documented

**Integration:**
□ Compatible with existing case management systems
□ Leverages current document templates appropriately
□ Maintains client data confidentiality
□ Follows established billing procedures
□ Integrates with court filing systems

**Risk Management:**
□ Malpractice risks assessed
□ Insurance requirements verified
□ Backup procedures established
□ Document retention policies defined
□ Quality review processes implemented

---

## Usage Guidelines

### For Multi-Agent Braided Implementation:
1. **Stage 1 (Thesis)**: Deploy identical prompts to {agent_count} agents simultaneously, each developing independent approaches
2. **Stage 2 (Antithesis)**: Provide all {agent_count} thesis outputs to multiple critique agents, ensuring comprehensive cross-analysis
3. **Stage 3 (Synthesis)**: Single agent (or consensus process) integrates ALL thesis proposals and ALL critiques into unified solution
4. **Stage 4 (Parenthesis)**: Formalization agent works with synthesized solution, maintaining awareness of multi-source heritage
5. **Stage 5 (Paralysis)**: Reflection agent evaluates entire process and synthesized outcome for iteration decisions

### For Braiding Quality Assurance:
1. Ensure all agents in each stage receive identical base materials and context
2. Track which synthesis decisions resolve conflicts between proposals and document rationale
3. Validate that formalization properly sequences elements from different source proposals
4. Monitor whether synthesis creates genuine value over individual approaches
5. Assess whether braiding complexity is justified by solution quality improvements

### For Prompt Evolution in Braided Context:
1. Track which types of thesis diversity produce the strongest synthesis outcomes
2. Monitor where critique agents identify systematic blind spots across multiple proposals
3. Identify synthesis patterns that consistently produce superior integrated solutions
4. Gather feedback on whether multi-perspective complexity improves or hinders implementation
5. Continuously refine based on multi-agent dialectic effectiveness patterns

### For System Implementation:
1. Replace template variables with domain and context-specific content
2. Apply appropriate domain overlay for specialized requirements
3. Include relevant quality gates for domain-specific validation
4. Customize success criteria and stakeholder considerations
5. Adjust deliverable formats based on domain needs

### For Prompt Evolution:
1. Track which prompts produce highest quality outputs
2. Monitor where additional clarification is frequently needed
3. Identify domain-specific patterns requiring template updates
4. Gather user feedback on prompt clarity and effectiveness
5. Continuously refine based on real-world usage patterns

### For Quality Assurance:
1. Validate that each stage builds properly on the previous
2. Ensure domain overlays maintain consistency with base templates
3. Verify quality gates align with domain best practices
4. Test prompt effectiveness across different use cases
5. Monitor for cognitive load issues in complex domains