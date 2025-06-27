-- Step 1: Create the new architectural tables

-- Table for defining hierarchical knowledge domains
CREATE TABLE public.dialectic_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_domain_id UUID REFERENCES public.dialectic_domains(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(parent_domain_id, name)
);
COMMENT ON TABLE public.dialectic_domains IS 'Defines hierarchical knowledge domains for dialectic processes (e.g., Software Development -> Backend -> Rust).';

-- Table for defining the types of artifacts the system can handle
CREATE TABLE public.dialectic_artifact_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    mime_type TEXT NOT NULL,
    default_file_extension TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.dialectic_artifact_types IS 'Defines the types of artifacts (e.g., PRD, Implementation Plan) used in processes.';

-- Table for defining the stages of a dialectic process
CREATE TABLE public.dialectic_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    -- Later, this could reference a prompt template table
    default_system_prompt_id UUID REFERENCES public.system_prompts(id),
    -- JSON schema to define expected input artifacts
    input_artifact_rules JSONB,
    -- JSON schema to define expected output artifacts
    expected_output_artifacts JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.dialectic_stages IS 'Defines a single stage within any dialectic process (e.g., Thesis, Antithesis).';

-- Table for defining process templates
CREATE TABLE public.dialectic_process_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID REFERENCES public.dialectic_domains(id) ON DELETE CASCADE NOT NULL,
    starting_stage_id UUID REFERENCES public.dialectic_stages(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(domain_id, name)
);
COMMENT ON TABLE public.dialectic_process_templates IS 'A template for a full dialectic process, linked to a domain.';

-- Table for defining transitions between stages within a process template
CREATE TABLE public.dialectic_stage_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_template_id UUID REFERENCES public.dialectic_process_templates(id) ON DELETE CASCADE NOT NULL,
    source_stage_id UUID REFERENCES public.dialectic_stages(id) ON DELETE CASCADE NOT NULL,
    target_stage_id UUID REFERENCES public.dialectic_stages(id) ON DELETE CASCADE NOT NULL,
    condition_description TEXT, -- e.g., "On user feedback"
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(process_template_id, source_stage_id, target_stage_id)
);
COMMENT ON TABLE public.dialectic_stage_transitions IS 'Defines the directed graph of a dialectic process, mapping how one stage leads to another.';

-- Step 2: Alter existing tables to integrate with the new architecture

-- Add a column to projects to link them to a process template instead of just a domain overlay
ALTER TABLE public.dialectic_projects ADD COLUMN process_template_id UUID REFERENCES public.dialectic_process_templates(id);
COMMENT ON COLUMN public.dialectic_projects.process_template_id IS 'The specific process template this project is executing.';

-- Alter domain_specific_prompt_overlays to link to dialectic_domains
ALTER TABLE public.domain_specific_prompt_overlays ADD COLUMN domain_id UUID REFERENCES public.dialectic_domains(id) ON DELETE CASCADE;
COMMENT ON COLUMN public.domain_specific_prompt_overlays.domain_id IS 'Links the overlay to a specific knowledge domain.';

-- Step 3: Deprecate old columns and tables no longer needed by the new structure

-- Drop the direct association from system_prompts to a single stage
ALTER TABLE public.system_prompts DROP COLUMN IF EXISTS is_stage_default;
ALTER TABLE public.system_prompts DROP COLUMN IF EXISTS stage_association;
ALTER TABLE public.system_prompts DROP COLUMN IF EXISTS variables_required;
ALTER TABLE public.system_prompts DROP COLUMN IF EXISTS context;

-- Drop the old domain_tag column from the overlays table, as it's replaced by domain_id
-- This MUST be done before seeding new data that doesn't use this column.
ALTER TABLE public.domain_specific_prompt_overlays DROP COLUMN IF EXISTS domain_tag;

-- Step 4: Seed the new tables with MVP data

-- This is a DO block to allow for variable declaration
DO $$
DECLARE
    -- Domain IDs
    general_domain_id UUID;
    software_dev_domain_id UUID;
    backend_domain_id UUID;
    frontend_domain_id UUID;
    full_stack_domain_id UUID;
    mobile_domain_id UUID;
    finance_domain_id UUID;
    engineering_domain_id UUID;
    construction_domain_id UUID;
    legal_domain_id UUID;

    -- Process Template ID
    general_process_id UUID;
    software_dev_process_id UUID;

    -- Stage IDs
    thesis_stage_id UUID;
    antithesis_stage_id UUID;
    synthesis_stage_id UUID;
    parenthesis_stage_id UUID;
    paralysis_stage_id UUID;

    -- System Prompt IDs
    thesis_prompt_id UUID;
    antithesis_prompt_id UUID;
    synthesis_prompt_id UUID;
    parenthesis_prompt_id UUID;
    paralysis_prompt_id UUID;
    
BEGIN

    -- Idempotency: Clean up previous partial runs of this script
    DELETE FROM public.domain_specific_prompt_overlays WHERE description LIKE '%overlay for Thesis stage%';
    DELETE FROM public.system_prompts WHERE name LIKE 'dialectic_%_base_v1';
    DELETE FROM public.dialectic_stage_transitions WHERE process_template_id IN (SELECT id FROM public.dialectic_process_templates);
    DELETE FROM public.dialectic_process_templates WHERE name LIKE 'Standard % Process' OR name LIKE 'Standard % Lifecycle';
    DELETE FROM public.dialectic_stages WHERE slug IN ('thesis', 'antithesis', 'synthesis', 'parenthesis', 'paralysis');
    DELETE FROM public.dialectic_domains;


    -- Seed Domains (Top-level) one by one to safely capture returning IDs
    INSERT INTO public.dialectic_domains (name, description) VALUES
        ('General', 'For non-specific or general-purpose knowledge work projects.')
    RETURNING id INTO general_domain_id;

    INSERT INTO public.dialectic_domains (name, description) VALUES
        ('Software Development', 'The process of designing, creating, testing, and maintaining software.')
    RETURNING id INTO software_dev_domain_id;
    
    INSERT INTO public.dialectic_domains (name, description) VALUES
        ('Financial Analysis', 'The process of evaluating businesses, projects, budgets, and other finance-related transactions to determine their performance and suitability.')
    RETURNING id INTO finance_domain_id;

    INSERT INTO public.dialectic_domains (name, description) VALUES
        ('Engineering', 'The use of scientific principles to design and build machines, structures, and other items, including bridges, tunnels, roads, vehicles, and buildings.')
    RETURNING id INTO engineering_domain_id;
        
    INSERT INTO public.dialectic_domains (name, description) VALUES
        ('Construction', 'The process of constructing a building or infrastructure.')
    RETURNING id INTO construction_domain_id;
        
    INSERT INTO public.dialectic_domains (name, description) VALUES
        ('Legal', 'Relating to the law, including legal practice, document management, and compliance.')
    RETURNING id INTO legal_domain_id;

    -- Seed Sub-domains for Software Development one by one
    INSERT INTO public.dialectic_domains (parent_domain_id, name, description) VALUES
        (software_dev_domain_id, 'Backend', 'Development of server-side logic, databases, and APIs.');
    INSERT INTO public.dialectic_domains (parent_domain_id, name, description) VALUES
        (software_dev_domain_id, 'Frontend', 'Development of the user interface and client-side logic of a web application.');
    INSERT INTO public.dialectic_domains (parent_domain_id, name, description) VALUES
        (software_dev_domain_id, 'Full Stack', 'Development of both client and server software.');
    INSERT INTO public.dialectic_domains (parent_domain_id, name, description) VALUES
        (software_dev_domain_id, 'Mobile', 'Development of applications for mobile devices.');
    
    -- Seed Dialectic Stages (The 5 core stages of the default process) one by one
    INSERT INTO public.dialectic_stages (slug, display_name, description) VALUES
        ('thesis', 'Thesis', 'Generate initial, diverse solutions to the prompt.')
    RETURNING id INTO thesis_stage_id;
    INSERT INTO public.dialectic_stages (slug, display_name, description) VALUES
        ('antithesis', 'Antithesis', 'Critique the generated solutions from the Thesis stage.')
    RETURNING id INTO antithesis_stage_id;
    INSERT INTO public.dialectic_stages (slug, display_name, description) VALUES
        ('synthesis', 'Synthesis', 'Combine the original ideas and critiques into a single, refined version.')
    RETURNING id INTO synthesis_stage_id;
    INSERT INTO public.dialectic_stages (slug, display_name, description) VALUES
        ('parenthesis', 'Parenthesis', 'Formalize the synthesized solution into a detailed, executable plan.')
    RETURNING id INTO parenthesis_stage_id;
    INSERT INTO public.dialectic_stages (slug, display_name, description) VALUES
        ('paralysis', 'Paralysis', 'Finalize the solution into a production-ready implementation plan.')
    RETURNING id INTO paralysis_stage_id;

    -- Seed a default Process Template for Software Development
    INSERT INTO public.dialectic_process_templates (domain_id, starting_stage_id, name, description) VALUES
        (software_dev_domain_id, thesis_stage_id, 'Standard Software Development Lifecycle', 'A standard 5-stage dialectic process for planning software projects.')
    RETURNING id INTO software_dev_process_id;

    -- Seed a default Process Template for the General domain
    INSERT INTO public.dialectic_process_templates (domain_id, starting_stage_id, name, description) VALUES
        (general_domain_id, thesis_stage_id, 'Standard Dialectic Process', 'A standard 5-stage dialectic process for general knowledge work.')
    RETURNING id INTO general_process_id;

    -- Seed the transitions for the default process
    INSERT INTO public.dialectic_stage_transitions (process_template_id, source_stage_id, target_stage_id, condition_description) VALUES
        (software_dev_process_id, thesis_stage_id, antithesis_stage_id, 'On user submission of Thesis feedback'),
        (software_dev_process_id, antithesis_stage_id, synthesis_stage_id, 'On user submission of Antithesis feedback'),
        (software_dev_process_id, synthesis_stage_id, parenthesis_stage_id, 'On user submission of Synthesis feedback'),
        (software_dev_process_id, parenthesis_stage_id, paralysis_stage_id, 'On user submission of Parenthesis feedback');
        
    -- Seed the transitions for the general process
    INSERT INTO public.dialectic_stage_transitions (process_template_id, source_stage_id, target_stage_id, condition_description) VALUES
        (general_process_id, thesis_stage_id, antithesis_stage_id, 'On user submission of Thesis feedback'),
        (general_process_id, antithesis_stage_id, synthesis_stage_id, 'On user submission of Antithesis feedback'),
        (general_process_id, synthesis_stage_id, parenthesis_stage_id, 'On user submission of Synthesis feedback'),
        (general_process_id, parenthesis_stage_id, paralysis_stage_id, 'On user submission of Parenthesis feedback');

    -- Seed System Prompts for each stage from sample_prompts.md
    
    -- Thesis Prompt
    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description) VALUES
    (
        'dialectic_thesis_base_v1',
        E'We\'re developing a comprehensive solution for {user_objective} in the {domain} domain.\n\n**Dialectic Process Context:**\nYou are participating in a collaborative dialectic process. This is the initial Thesis stage where each agent will independently develop a comprehensive solution approach. Your output will be combined with other thesis proposals in subsequent stages to create a robust, multi-perspective solution.\n\n{{#section:context_description}}\n**Context:**\n{initial_user_prompt}\n{{/section:context_description}}\n\n{{#section:deployment_context}}\n**Deployment Environment:**\n{deployment_context}\n{{/section:deployment_context}}\n\n{{#section:reference_documents}}\n**Reference Materials:**\nYou have been provided with the following reference documents that must be considered and integrated into your solution:\n{reference_documents}\n\nThese materials represent existing assets, standards, constraints, or requirements that your solution must accommodate, leverage, or comply with. Ensure your approach:\n- Builds upon existing assets rather than duplicating effort\n- Maintains compatibility with established systems\n- Adheres to documented standards and procedures\n- Respects organizational constraints and preferences\n{{/section:reference_documents}}\n\n**Your Task:**\nCreate a detailed product requirements document and a draft proposal for an implementation plan that addresses this objective using {domain_standards} best practices. Your solution should be:\n- Safe and secure\n- Reliable and performant\n- Sophisticated yet maintainable\n- Scalable and extensible\n- Modular and well-architected\n\n**Unique Perspective Requirement:**\nSince your output will be braided with other agents thesis proposals, focus on developing a distinctive approach that:\n- Offers unique insights or methodologies\n- Explores different architectural patterns or strategies\n- Considers alternative risk/benefit trade-offs\n- Brings different domain expertise to bear on the problem\n- Provides complementary perspectives to potential alternative approaches\n\n**Deliverables:**\n1. Executive summary of your approach\n2. Detailed implementation strategy\n3. Step-by-step development checklist\n4. Risk assessment and mitigation strategies\n5. Success metrics aligned with {success_criteria}\n6. An .md formatted product requirements document, and an .md formatted implementation plan proposal.\n\n**Quality Standards:**\n- Address all aspects of {constraint_boundaries}\n- Consider impact on {stakeholder_considerations}\n- Ensure deliverable meets {deliverable_format} requirements\n- Integrate and build upon {reference_documents}\n- Comply with {compliance_requirements}\n\nThink comprehensively. Be verbose and explanatory. Document every relevant aspect without omitting critical details.\n\n**Validation Checkpoint:**\nBefore proceeding, verify your solution addresses:\n□ All stated requirements\n□ Domain-specific best practices\n□ Stakeholder needs\n□ Technical feasibility\n□ Resource constraints\n□ Integration with existing reference materials\n□ Compliance with provided standards and procedures\n□ Offers a distinctive perspective that will complement other approaches\n',
        true, 1, 'Base prompt for the Thesis stage of the dialectic process.'
    ) RETURNING id INTO thesis_prompt_id;

    -- Antithesis Prompt
    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description) VALUES
    (
        'dialectic_antithesis_base_v1',
        E'**Critical Analysis Task:**\nThoroughly critique all attached {domain} implementation plans with expert-level scrutiny.\n\n**Dialectic Process Context:**\nYou are participating in a braided dialectic process. You have been provided with {agent_count} different thesis proposals from the previous stage. Each represents a different approach to solving {user_objective}. Your task is to provide comprehensive critical analysis that examines ALL proposals collectively and individually.\n\n**Multi-Perspective Analysis Framework:**\nYou must analyze:\n1. **Individual Plan Critiques**: Detailed analysis of each thesis proposal\'s strengths and weaknesses\n2. **Comparative Assessment**: How the different approaches compare, contrast, and potentially conflict\n3. **Gap Analysis**: What important aspects are missed across ALL proposals\n4. **Integration Challenges**: Where combining elements from different proposals might create conflicts\n5. **Collective Blind Spots**: Assumptions or risks that appear across multiple or all proposals\n\n{{#section:reference_documents}}\n**Reference Context:**\nYou have access to the following reference materials that inform your analysis:\n{reference_documents}\n\nUse these materials to:\n- Verify alignment with existing systems and standards across all proposals\n- Identify compatibility issues or integration challenges in each approach\n- Assess whether proposals leverage existing assets effectively\n- Check compliance with documented procedures and requirements\n{{/section:reference_documents}}\n\n**Your Expertise:**\nYou are a seasoned {domain} professional with deep knowledge of {domain_standards} and extensive experience identifying project failure points.\n\n**Analysis Framework:**\nFor each thesis proposal, examine:\n1. **Technical Accuracy**: Identify factual errors, outdated practices, or misapplied concepts\n2. **Risk Assessment**: Highlight overlooked risks, vulnerabilities, or failure modes\n3. **Best Practice Compliance**: Compare against {domain_standards} and identify gaps\n4. **Stakeholder Impact**: Assess potential negative effects on {stakeholder_considerations}\n5. **Resource Realism**: Evaluate feasibility given typical constraints\n6. **Scalability Concerns**: Identify limitations that could impede growth or adaptation\n\n**Cross-Proposal Analysis:**\nAdditionally, assess:\n- **Conflicting Approaches**: Where proposals contradict each other and why\n- **Complementary Elements**: Which aspects from different proposals could be combined effectively\n- **Consensus Patterns**: What approaches or principles appear consistently across proposals\n- **Coverage Gaps**: What critical aspects are inadequately addressed across all proposals\n- **Resource Conflicts**: Where different proposals would compete for the same resources\n\n**Critical Examination Areas:**\n- Are all {constraint_boundaries} properly addressed across proposals?\n- Do the solutions meet {success_criteria} comprehensively?\n- Are there hidden dependencies or circular logic in any approach?\n- What assumptions lack validation across the proposals?\n- Where might implementation fail under stress?\n- How well do the proposals integrate with {reference_documents}?\n- Are there conflicts with existing systems or procedures?\n- Do the plans comply with {compliance_requirements}?\n\n**Your Deliverable:**\nCreate a comprehensive critique that includes:\n1. **Executive Summary**: Overview of critical findings across all proposals\n2. **Individual Plan Analysis**: Detailed critique of each thesis proposal\n3. **Comparative Analysis**: Strengths/weaknesses comparison between approaches\n4. **Integration Assessment**: Evaluation of how elements might be combined\n5. **Collective Risk Assessment**: Risks that span multiple approaches\n6. **Specific Recommendations**: Improvements for each individual proposal\n7. **Synthesis Guidance**: Recommendations for how to best combine elements in the next stage\n\n**Quality Gate:**\nYour critique should be so thorough that following your recommendations would result in significantly more robust, reliable, and successful implementation options.\n\n**Validation Checkpoint:**\nEnsure your critique addresses:\n□ All major technical concerns across all proposals\n□ Risk mitigation strategies for each approach\n□ Alternative solution approaches where applicable\n□ Resource requirement adjustments for each proposal\n□ Timeline impact assessment across approaches\n□ Integration with existing reference materials for all proposals\n□ Compliance with documented standards across all approaches\n□ Compatibility with current systems and procedures for each proposal\n□ Clear guidance for synthesis of multiple perspectives\n\n{{#section:prior_stage_ai_outputs}}You will be applying this direction and standards to the following section:\n\n{prior_stage_ai_outputs}{{/section:prior_stage_ai_outputs}}\n\n{{#section:prior_stage_user_feedback}}You will consider the Users feedback on the these contributions:\n\n **User Feedback on Contributions**{prior_stage_user_feedback}{{/section:prior_stage_user_feedback}}',
        true, 1, 'Base prompt for the Antithesis stage, focusing on critical analysis.'
    ) RETURNING id INTO antithesis_prompt_id;

    -- Synthesis Prompt
    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description) VALUES
    (
        'dialectic_synthesis_base_v1',
        E'**Synthesis Objective:**\nIntegrate multiple thesis proposals with comprehensive critical analyses to create an optimized, unified solution for {user_objective}.\n\n**Dialectic Process Context:**\nYou are working with outputs from a braided dialectic process where {agent_count} agents developed different approaches, and each approach was critiqued by multiple analysts. You must now weave together the strongest elements from all perspectives into a single, superior solution.\n\n{{#section:reference_documents}}\n**Reference Documents:**\nYou have access to the following reference documents that must be considered and integrated:\n{reference_documents}\n{{/section:reference_documents}}\n\n**Integration Framework:**\nYou have access to:\n1. **Multiple Thesis Proposals**: {agent_count} different implementation approaches from the initial stage\n2. **Comprehensive Critiques**: Multiple critical analyses examining each proposal and their interactions\n3. **Domain standards**: {domain_standards}\n4. **Success criteria**: {success_criteria}\n5. **Constraint boundaries**: {constraint_boundaries}\n6. **Compliance requirements**: {compliance_requirements}\n\n**Multi-Perspective Synthesis Process:**\n\n**1. Comparative Analysis:**\n- Identify the strongest elements from each thesis proposal\n- Map where different approaches complement vs. conflict with each other\n- Determine which critiques apply to individual proposals vs. systemic issues\n- Assess which combination of approaches best serves {stakeholder_considerations}\n\n**2. Conflict Resolution:**\n- Where thesis proposals contradict each other, determine the optimal approach based on:\n  * Alignment with {success_criteria}\n  * Compliance with {constraint_boundaries}\n  * Integration with the provided reference documents\n  * Risk mitigation effectiveness\n  * Resource efficiency\n- Address criticisms that apply across multiple proposals\n- Resolve tensions between competing priorities or methodologies\n\n**3. Gap Integration:**\n- Address areas inadequately covered by any individual proposal\n- Incorporate insights from critiques that highlight missing elements\n- Ensure comprehensive coverage of all requirements and stakeholder needs\n- Fill integration gaps between different proposal elements\n\n**4. Optimization:**\n- Combine complementary strengths from different approaches\n- Eliminate redundancies where proposals overlap\n- Streamline processes where multiple proposals suggest similar solutions\n- Enhance efficiency while maintaining robustness\n\n**Your Task:**\nCreate a unified, superior solution that:\n- Preserves the best elements from all thesis proposals\n- Addresses all valid criticisms from the analyses\n- Resolves conflicts between competing approaches through principled decision-making\n- Optimizes for {success_criteria} while respecting {constraint_boundaries}\n- Leverages existing assets documented in the reference documents\n- Ensures full compliance with {compliance_requirements}\n- Creates synergies between different approaches where possible\n\n**Synthesis Process:**\n1. **Element Evaluation**: Score and compare key elements from each proposal\n2. **Conflict Resolution**: Make principled decisions where approaches disagree\n3. **Gap Filling**: Address areas missed by individual proposals\n4. **Integration Planning**: Ensure chosen elements work together harmoniously\n5. **Risk Consolidation**: Create comprehensive risk mitigation drawing from all analyses\n6. **Stakeholder Optimization**: Ensure solution serves all {stakeholder_considerations} effectively\n\n**Deliverables:**\n1. **Enhanced Product Requirements Document**: Unified vision incorporating best elements\n2. **Comprehensive Implementation Checklist**: Dependency-ordered, drawing from all proposals\n3. **Consolidated Risk Mitigation Strategies**: Addressing all identified concerns\n4. **Integrated Success Metrics**: Validation criteria incorporating all perspectives\n5. **Unified Resource Requirements**: Realistic timeline and resource allocation\n6. **Synthesis Rationale**: Documentation of key decisions and why alternatives were rejected\n\n**Quality Standards:**\n- Solution must be implementable following the checklist in order\n- Each step must have clear inputs, processes, and outputs\n- Include specific validation criteria for each milestone\n- Address scalability and maintainability concerns from all proposals\n- Provide fallback strategies for high-risk elements identified in any critique\n- Demonstrate clear superiority over any individual thesis proposal\n\n**Validation Checkpoint:**\nVerify the synthesized solution:\n□ Addresses all original requirements comprehensively\n□ Incorporates critical feedback from all analyses\n□ Maintains technical feasibility across all integrated elements\n□ Serves all stakeholder needs identified across proposals\n□ Provides clear, unified implementation path\n□ Leverages existing reference materials more effectively than individual proposals\n□ Maintains compliance with all documented requirements\n□ Resolves conflicts between proposals through documented rationale\n□ Creates positive synergies between different approaches\n\n{{#section:prior_stage_ai_outputs}}You will be applying this direction and standards to the following section:\n\n{prior_stage_ai_outputs}{{/section:prior_stage_ai_outputs}}\n\n{{#section:prior_stage_user_feedback}}You will consider the Users feedback on the these contributions:\n\n **User Feedback on Contributions**{prior_stage_user_feedback}{{/section:prior_stage_user_feedback}}',
        true, 1, 'Base prompt for the Synthesis stage, focusing on integrating multiple perspectives.'
    ) RETURNING id INTO synthesis_prompt_id;

    -- Parenthesis Prompt
    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description) VALUES
    (
        'dialectic_parenthesis_base_v1',
        E'**Formalization Objective:**\nTransform the synthesized solution (which integrated multiple thesis proposals and their critiques) into a production-ready implementation plan with rigorous detail and formal structure.\n\n**Dialectic Process Context:**\nYou are working with a solution that represents the best elements from {agent_count} different thesis approaches, refined through comprehensive critical analysis and intelligently synthesized. Your task is to formalize this multi-perspective solution into an executable implementation plan.\n\n**Multi-Source Integration Context:**\nThe synthesized solution you\'re formalizing incorporates:\n- Strongest elements from {agent_count} different thesis proposals\n- Resolution of conflicts between competing approaches  \n- Responses to critiques that identified gaps and risks across all original proposals\n- Optimizations that create synergies between different methodological approaches\n\n{{#section:deployment_context}}\n**Current State Assessment:**\n{deployment_context}\n{{/section:deployment_context}}\n\n{{#section:reference_documents}}\n**Reference Materials Integration:**\nYou must incorporate and build upon the following existing assets and documentation:\n{reference_documents}\n\nThese materials define:\n- Existing systems that must be preserved or integrated with\n- Established standards and procedures that must be followed\n- Available resources and constraints that shape implementation\n- Compliance requirements that cannot be violated\n- Organizational preferences and approved methodologies\n{{/section:reference_documents}}\n\n**Governing Standards:**\nYou must strictly adhere to:\n- Domain standards: {domain_standards}\n- Success criteria: {success_criteria}\n- Constraint boundaries: {constraint_boundaries}\n- Stakeholder requirements: {stakeholder_considerations}\n- Reference documentation: {reference_documents}\n- Compliance mandates: {compliance_requirements}\n\n**Formalization Requirements:**\n\n1. **Dependency Ordering**: Create a strictly sequential implementation path where each step builds on completed prior work, accounting for the complexity of the multi-source synthesis\n2. **Granular Detail**: Break complex synthesized tasks into atomic, unambiguous actions\n3. **Quality Gates**: Define specific validation criteria for each major milestone, incorporating validation approaches from multiple original proposals\n4. **Resource Specification**: Detail exact requirements (time, expertise, tools, budget) based on realistic assessment of the synthesized approach\n5. **Risk Mitigation**: Embed safeguards and contingency plans addressing risks identified across all original proposals\n\n**Multi-Perspective Formalization Considerations:**\n- **Approach Integration**: Ensure steps properly sequence elements drawn from different thesis proposals\n- **Conflict Resolution Documentation**: Where synthesis chose between competing approaches, document the rationale and ensure implementation steps reflect those decisions\n- **Synergy Realization**: Structure implementation to capture positive interactions between elements from different proposals\n- **Comprehensive Coverage**: Ensure formalization addresses all aspects identified across the full spectrum of original proposals\n\n**Expected Deliverable Format:**\n{deliverable_format}\n\n**Implementation Plan Structure:**\n1. **Executive Summary**: Clear statement of objectives and unified approach\n2. **Synthesis Summary**: Brief explanation of how multiple approaches were integrated\n3. **Prerequisites**: What must exist before implementation begins\n4. **Phase-by-Phase Breakdown**: Logical groupings of related work from the synthesized solution\n5. **Detailed Checklist**: Step-by-step instructions for primary implementation phase\n6. **Quality Assurance Protocol**: Validation steps and acceptance criteria incorporating multiple validation approaches\n7. **Comprehensive Risk Management**: Identified risks with specific mitigation strategies from all source analyses\n8. **Integrated Success Metrics**: Measurable outcomes aligned with {success_criteria} and drawing from all proposals\n\n**Checklist Item Standards:**\nEach checklist item must:\n- Be implementable by a skilled practitioner following the instructions\n- Have clear inputs (what you need to start)\n- Have clear outputs (what you produce)\n- Include validation criteria (how you know it\'s done correctly)\n- Reference relevant standards or guidelines\n- Specify any tools or resources required\n- Account for the multi-source nature of the synthesized solution\n- Indicate where steps derive from specific original proposals when relevant for context\n\n**Quality Gate Validation:**\nBefore proceeding, ensure:\n□ Implementation path has no dependency gaps despite multi-source integration\n□ Each step is atomic and unambiguous\n□ Validation criteria are measurable and comprehensive\n□ Risk mitigation is embedded throughout, addressing concerns from all original analyses\n□ Resource requirements are realistic for the synthesized approach\n□ Timeline accounts for quality assurance across all integrated elements\n□ Integration with existing systems is planned comprehensively\n□ Compliance requirements are addressed at each step\n□ Reference materials are appropriately leveraged throughout\n□ Synthesis decisions are properly reflected in implementation steps\n□ Synergies between different approaches are captured in the implementation sequence\n\n{{#section:prior_stage_ai_outputs}}You will be applying this direction and standards to the following section:\n\n{prior_stage_ai_outputs}{{/section:prior_stage_ai_outputs}}\n\n{{#section:prior_stage_user_feedback}}You will consider the Users feedback on the these contributions:\n\n **User Feedback on Contributions**{prior_stage_user_feedback}{{/section:prior_stage_user_feedback}}',
        true, 1, 'Base prompt for the Parenthesis stage, focusing on formalization and refinement.'
    ) RETURNING id INTO parenthesis_prompt_id;

    -- Paralysis Prompt
    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description) VALUES
    (
        'dialectic_paralysis_base_v1',
        E'**Reflection Objective:**\nConduct a comprehensive assessment of the formalized implementation plan (derived from multiple synthesized perspectives) and determine optimal path forward.\n\n**Dialectic Process Context:**\nYou are evaluating the culmination of a braided dialectic process that began with {agent_count} different thesis approaches, subjected them to comprehensive critical analysis, synthesized the best elements into a unified solution, and formalized that synthesis into an executable plan. Your assessment must consider this multi-perspective heritage.\n\n**Multi-Source Solution Assessment:**\nThe implementation plan you\'re evaluating represents:\n- Integration of {agent_count} different thesis approaches\n- Resolution of conflicts and contradictions between methodologies\n- Incorporation of critical insights from comprehensive analyses\n- Synthesis optimization that created synergies between approaches\n- Formalization that maintains the multi-perspective advantages\n\n**Assessment Framework:**\nEvaluate the complete dialectic process and its output against all provided context:\n\n{{#section:reference_documents}}\n**Reference Materials Validation:**\nFirst, assess how well the solution integrates with {reference_documents}:\n- Are existing assets properly leveraged rather than duplicated?\n- Does the plan maintain compatibility with current systems?\n- Are documented standards and procedures followed consistently?\n- Have organizational constraints been respected?\n- Is there proper compliance with {compliance_requirements}?\n{{/section:reference_documents}}\n\n**1. Solution Quality Analysis**\n   - Does the final plan adequately address {user_objective}?\n   - Are {success_criteria} achievable following this plan?\n   - Do the proposed methods align with {domain_standards}?\n   - Are {constraint_boundaries} properly respected?\n   - **Multi-Perspective Evaluation**: Does the synthesized solution demonstrate clear advantages over any individual thesis proposal?\n\n**2. Implementation Feasibility Review**\n   - Is the dependency ordering correct and complete, accounting for the integrated nature of the solution?\n   - Are resource requirements realistic and available for the synthesized approach?\n   - Is the timeline achievable given the complexity of the multi-source solution?\n   - Are quality gates sufficient to ensure success across all integrated elements?\n   - **Integration Complexity**: Are there hidden complexities from combining different approaches?\n\n**3. Risk Assessment Validation**\n   - Have all significant risks been identified and addressed across all original proposals?\n   - Are mitigation strategies practical and effective for the synthesized solution?\n   - What failure modes remain unaddressed despite the comprehensive multi-perspective analysis?\n   - Are contingency plans adequate for the increased complexity of the integrated approach?\n   - **Synthesis Risks**: Are there new risks created by combining different methodologies?\n\n**4. Stakeholder Impact Evaluation**\n   - How well does the solution serve {stakeholder_considerations}?\n   - Are there unintended consequences for any stakeholder group from the synthesized approach?\n   - Does the plan account for change management needs given the comprehensive solution?\n   - Are communication and training requirements addressed across all integrated elements?\n\n**5. Multi-Perspective Value Assessment**\n   - **Synergy Realization**: Are the predicted synergies between different approaches actually achievable?\n   - **Conflict Resolution Quality**: Were conflicts between approaches resolved optimally?\n   - **Coverage Completeness**: Does the synthesized solution address aspects missed by individual proposals?\n   - **Integration Elegance**: Is the combination of approaches elegant and maintainable, or overly complex?\n\n**Critical Questions:**\n- What aspects of the synthesized plan remain unclear or ambiguous?\n- Where might implementation stall due to the complexity of integrated approaches?\n- What assumptions in the multi-source plan lack sufficient validation?\n- How could the approach be simplified without losing the advantages of synthesis?\n- What external dependencies could derail the integrated project?\n- **Synthesis-Specific**: Are there aspects where the synthesis created unnecessary complexity compared to simpler individual approaches?\n\n**Iteration Recommendation Framework:**\nBased on your comprehensive assessment, recommend one of the following:\n\n**Option A: Proceed with Implementation**\nIf the synthesized plan is comprehensive, feasible, and demonstrates clear advantages:\n- Confirm readiness for implementation of the integrated solution\n- Highlight key success factors specific to the multi-perspective approach\n- Identify critical path items requiring extra attention due to synthesis complexity\n- Suggest implementation team structure that can handle the integrated methodology\n\n**Option B: Focused Refinement Required**\nIf specific areas need improvement but overall synthesized approach is sound:\n- Identify exact areas requiring additional work\n- Specify what type of refinement is needed (individual elements vs. integration points)\n- Suggest whether refinement should focus on specific original proposals or synthesis decisions\n- Provide guidance for targeted improvements without losing multi-perspective advantages\n\n**Option C: Partial Re-synthesis Needed**\nIf integration of certain approaches creates problems but core synthesis is valuable:\n- Identify which integrated elements are problematic\n- Suggest alternative ways to combine the strong proposals\n- Recommend revisiting specific synthesis decisions\n- Provide guidance for re-synthesis of particular aspects\n\n**Option D: Fundamental Redesign Needed**\nIf the synthesis approach has significant flaws requiring major revision:\n- Identify fundamental issues with the synthesized approach\n- Assess whether problems stem from individual proposals or synthesis methodology\n- Suggest alternative framing of the problem or synthesis approaches\n- Recommend starting fresh with modified requirements or different proposal selection\n\n**Final Deliverable:**\n1. **Executive Assessment**: Overall quality and readiness evaluation of the synthesized solution\n2. **Multi-Perspective Value Analysis**: Assessment of whether synthesis achieved superior results\n3. **Detailed Findings**: Specific strengths and weaknesses of the integrated approach\n4. **Implementation Readiness Report**: Go/no-go recommendation with synthesis-specific reasoning\n5. **Integration Quality Assessment**: Evaluation of how well different approaches were combined\n6. **Next Steps Guidance**: Specific actions based on your recommendation\n7. **Synthesis Lessons Learned**: Insights for improving future multi-perspective dialectic processes\n8. **Success Probability Estimate**: Realistic assessment of likely outcomes for the integrated solution\n\n**Validation Checkpoint:**\nEnsure your reflection addresses:\n□ Solution completeness and accuracy across all integrated elements\n□ Implementation feasibility of the synthesized approach\n□ Risk adequacy for the multi-perspective solution\n□ Stakeholder satisfaction with the integrated approach\n□ Clear recommendation with synthesis-specific rationale\n□ Integration with existing reference materials across all solution components\n□ Compliance with all documented requirements throughout the synthesized plan\n□ Preservation of valuable existing assets in the integrated solution\n□ Assessment of whether multi-perspective synthesis delivered superior value\n□ Evaluation of integration complexity vs. individual approach simplicity\n□ Quality of conflict resolution between different methodological approaches\n\n{{#section:prior_stage_ai_outputs}}You will be applying this direction and standards to the following section:\n\n{prior_stage_ai_outputs}{{/section:prior_stage_ai_outputs}}\n\n{{#section:prior_stage_user_feedback}}You will consider the Users feedback on the these contributions:\n\n **User Feedback on Contributions**{prior_stage_user_feedback}{{/section:prior_stage_user_feedback}}',
        true, 1, 'Base prompt for the Paralysis stage, focusing on reflection and iteration assessment.'
    ) RETURNING id INTO paralysis_prompt_id;
    
    -- Seed Domain Specific Prompt Overlays
    -- This links a domain, a stage (via a prompt), and the specific overlay values.
    
    -- General Domain Overlay
    INSERT INTO public.domain_specific_prompt_overlays (system_prompt_id, domain_id, overlay_values, description, version)
    VALUES (
        thesis_prompt_id,
        general_domain_id,
        '{"domain": "General Knowledge Work", "domain_standards": "Clarity, logical consistency, completeness, accuracy, and actionability.", "reference_documents": "Any provided source materials, user requirements, or contextual documents.", "compliance_requirements": "Adherence to any user-specified constraints or ethical guidelines.", "system_defined_additional_overlay_considerations": "- Ensure the proposed solution is well-structured and easy to understand.\\n- Break down complex ideas into manageable parts.\\n- Clearly state any assumptions being made.\\n- Define key terms and concepts.\\n- Provide a clear rationale for the proposed approach."}',
        'General overlay for Thesis stage.',
        1
    );

    -- Software Development Overlays
    INSERT INTO public.domain_specific_prompt_overlays (system_prompt_id, domain_id, overlay_values, description, version)
    VALUES (
        thesis_prompt_id,
        software_dev_domain_id,
        '{"domain": "software development", "domain_standards": "clean code principles, SOLID design patterns, test-driven development, security-first architecture, CI/CD best practices", "reference_documents": "existing system architecture, API documentation, database schemas, coding standards, deployment configurations, security policies", "compliance_requirements": "security standards (SOC2, ISO 27001), accessibility guidelines (WCAG), data protection regulations (GDPR, CCPA)", "system_defined_additional_overlay_considerations": "- Code maintainability and documentation\\n- Performance optimization strategies\\n- Security vulnerability assessment\\n- Scalability architecture patterns\\n- Integration testing strategies"}',
        'Software Development overlay for Thesis stage.',
        1
    );

    -- Financial Analysis Overlays
    INSERT INTO public.domain_specific_prompt_overlays (system_prompt_id, domain_id, overlay_values, description, version)
    VALUES (
        thesis_prompt_id,
        finance_domain_id,
        '{"domain": "financial analysis and management", "domain_standards": "regulatory compliance (SEC, FINRA, SOX), risk management frameworks, fiduciary responsibility, audit trails, data security", "reference_documents": "existing financial models, budget constraints, regulatory filings, audit reports, risk assessments, compliance procedures", "compliance_requirements": "SEC regulations, FINRA rules, SOX compliance, AML requirements, tax code adherence", "system_defined_additional_overlay_considerations": "- Regulatory compliance requirements\\n- Risk assessment methodologies\\n- Financial modeling accuracy\\n- Audit trail maintenance\\n- Stakeholder reporting obligations"}',
        'Finance overlay for Thesis stage.',
        1
    );

    -- Engineering Overlays
    INSERT INTO public.domain_specific_prompt_overlays (system_prompt_id, domain_id, overlay_values, description, version)
    VALUES (
        thesis_prompt_id,
        engineering_domain_id,
        '{"domain": "engineering", "domain_standards": "safety regulations, environmental compliance, quality assurance protocols, technical design standards, systems engineering principles", "reference_documents": "architectural drawings, material specifications, soil reports, environmental assessments, performance simulations, technical specifications", "compliance_requirements": "environmental protection standards, OSHA safety requirements, industry-specific technical codes (e.g., IEEE, ASME)", "system_defined_additional_overlay_considerations": "- Safety protocol adherence\\n- Environmental impact assessment\\n- Technical feasibility analysis\\n- Quality control checkpoints\\n- Material and component stress analysis"}',
        'Engineering overlay for Thesis stage.',
        1
    );
    
    -- Construction Overlays
    INSERT INTO public.domain_specific_prompt_overlays (system_prompt_id, domain_id, overlay_values, description, version)
    VALUES (
        thesis_prompt_id,
        construction_domain_id,
        '{"domain": "construction", "domain_standards": "building codes, project management best practices, quality assurance protocols, site safety management", "reference_documents": "site surveys, architectural drawings, permit applications, material specifications, construction schedules", "compliance_requirements": "building codes, zoning regulations, local permits, OSHA safety requirements", "system_defined_additional_overlay_considerations": "- Safety protocol adherence\\n- Resource allocation optimization\\n- Timeline and milestone management\\n- Quality control checkpoints\\n- Sub-contractor coordination"}',
        'Construction overlay for Thesis stage.',
        1
    );

    -- Legal Overlays
    INSERT INTO public.domain_specific_prompt_overlays (system_prompt_id, domain_id, overlay_values, description, version)
    VALUES (
        thesis_prompt_id,
        legal_domain_id,
        '{"domain": "legal practice and document management", "domain_standards": "attorney-client privilege, ethical guidelines, procedural compliance, evidence handling, confidentiality protocols", "reference_documents": "existing contracts, case law precedents, regulatory guidance, court rules, client files, organizational policies", "compliance_requirements": "bar association rules, court procedures, confidentiality requirements, conflict of interest policies, billing regulations", "system_defined_additional_overlay_considerations": "- Ethical obligation compliance\\n- Procedural rule adherence\\n- Confidentiality maintenance\\n- Evidence chain of custody\\n- Client communication protocols"}',
        'Legal overlay for Thesis stage.',
        1
    );

    -- Associate the default system prompts with their respective stages in the default process template
    -- NOTE: This assumes a 1-to-1 mapping for the MVP. A more complex system might have a linking table.
    UPDATE public.dialectic_stages SET default_system_prompt_id = thesis_prompt_id WHERE id = thesis_stage_id;
    UPDATE public.dialectic_stages SET default_system_prompt_id = antithesis_prompt_id WHERE id = antithesis_stage_id;
    UPDATE public.dialectic_stages SET default_system_prompt_id = synthesis_prompt_id WHERE id = synthesis_stage_id;
    UPDATE public.dialectic_stages SET default_system_prompt_id = parenthesis_prompt_id WHERE id = parenthesis_stage_id;
    UPDATE public.dialectic_stages SET default_system_prompt_id = paralysis_prompt_id WHERE id = paralysis_stage_id;
    
END $$;

-- Make the new domain_id foreign key NOT NULL after it has been populated.
ALTER TABLE public.domain_specific_prompt_overlays ALTER COLUMN domain_id SET NOT NULL;

-- Final step: Add RLS policies for new tables if they don't exist
-- It's good practice to ensure security is applied from the start.

ALTER TABLE public.dialectic_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to read domains" ON public.dialectic_domains FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow service_role to manage domains" ON public.dialectic_domains FOR ALL TO service_role USING (true);

ALTER TABLE public.dialectic_artifact_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to read artifact types" ON public.dialectic_artifact_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow service_role to manage artifact types" ON public.dialectic_artifact_types FOR ALL TO service_role USING (true);

ALTER TABLE public.dialectic_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to read stages" ON public.dialectic_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow service_role to manage stages" ON public.dialectic_stages FOR ALL TO service_role USING (true);

ALTER TABLE public.dialectic_process_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to read process templates" ON public.dialectic_process_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow service_role to manage process templates" ON public.dialectic_process_templates FOR ALL TO service_role USING (true);

ALTER TABLE public.dialectic_stage_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to read stage transitions" ON public.dialectic_stage_transitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow service_role to manage stage transitions" ON public.dialectic_stage_transitions FOR ALL TO service_role USING (true);
