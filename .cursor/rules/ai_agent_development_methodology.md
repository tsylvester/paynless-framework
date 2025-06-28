# AI Agent Development Methodology & Workflow

## Core Development Philosophy

### Continuous Working State Principle
- The application must remain in a working, buildable state at every single step
- Never commit broken code, incomplete features, or failing tests
- Every commit represents a functional increment toward the complete feature
- Rollback capability exists at every step in the development process

### Dependency-First Development
- Always implement features in strict dependency order
- Lower-level components and utilities must be completed before dependent features
- No circular dependencies or forward references allowed
- Build foundation layers first, then compose higher-level functionality

## Pre-Development Planning

### Feature Scope Definition
Before any code is written, clearly define:
- **Feature Boundaries**: What specific functionality will be implemented
- **Acceptance Criteria**: How to validate the feature is complete and working
- **Dependency Map**: What components, utilities, or services this feature requires
- **Testing Strategy**: What tests will prove the feature works at each level

### Workplan Creation
Create a detailed, step-by-step implementation plan that:
- **Orders tasks by dependency**: Foundation components before dependent features
- **Identifies test requirements**: What tests need to be written at each step
- **Defines validation points**: How to verify each step is complete and working
- **Specifies commit boundaries**: Where to commit working increments

## Development Cycle Methodology

### Phase 1: Build Test Shell
**Objective**: Create the testing infrastructure before any implementation
- [ ] Create test files for all components in the feature scope
- [ ] Set up test runners and validation scripts
- [ ] Verify test infrastructure works (tests can run, even if empty)
- [ ] Commit: "feat: add test shell for [feature-name]"

### Phase 2: Build Red Tests (TDD Foundation)
**Objective**: Define feature contracts through failing tests
- [ ] Write comprehensive unit tests that define expected behavior
- [ ] Write integration tests for component interactions
- [ ] Write end-to-end tests for complete user workflows
- [ ] Verify all tests fail as expected (red state)
- [ ] Commit: "test: add failing tests for [feature-name] contracts"

### Phase 3: Build Minimal Functions (Green Implementation)
**Objective**: Implement just enough code to make tests pass
- [ ] Implement minimal viable code to satisfy test contracts
- [ ] Focus on making tests pass, not on optimization or features beyond scope
- [ ] Maintain strict adherence to defined interfaces and types
- [ ] Verify all tests now pass (green state)
- [ ] Commit: "feat: implement [feature-name] core functionality"

### Phase 4: Prove Green Tests (Validation)
**Objective**: Comprehensive validation of feature completion
- [ ] Run complete test suite (unit + integration + e2e)
- [ ] Verify application builds successfully
- [ ] Test feature functionality manually in development environment
- [ ] Validate no regressions in existing functionality
- [ ] Commit: "test: validate [feature-name] complete implementation"

### Phase 5: Iterate to Next Set
**Objective**: Prepare for next development cycle
- [ ] Update workplan with lessons learned
- [ ] Identify next feature or component in dependency order
- [ ] Clean up any temporary code or comments
- [ ] Update documentation if interfaces changed
- [ ] Commit: "docs: update for [feature-name] completion"

## Environment & Workspace Management

### Monorepo Workflow Standards
- **Workspace Dependencies**: Manage inter-component dependencies within monorepo structure
- **Build Orchestration**: Use tools like Nx, Lerna, or Rush for coordinated builds
- **Shared Tooling**: Consistent linting, testing, and build configurations across workspace
- **Selective Builds**: Only build affected components based on change detection
- **Version Coordination**: Synchronized versioning across related components

### Environment Promotion Workflow
- **Development Environment**: Local development with hot reloading and debugging
- **Staging Environment**: Integration testing with production-like configuration
- **Production Environment**: Live deployment with monitoring and rollback capabilities
- **Environment Parity**: Consistent configuration and behavior across all environments
- **Configuration Management**: Environment-specific settings without code changes

## Multi-Feature Development

### Feature Set Completion
- Complete ALL features in the defined scope before pushing to remote
- Each feature follows the full 5-phase cycle
- Validate the entire feature set works together
- Run full regression testing on the complete feature set

### Remote Repository Rules
- **Never push incomplete features**: Only push complete, tested feature sets
- **Never push failing tests**: All tests must pass before remote push
- **Never push broken builds**: Application must build and run successfully
- **Atomic Feature Delivery**: Each push represents a complete, usable increment

## Collaborative Development Patterns

### AI Agent Collaboration Guidelines
- **Pair Programming with AI**: When to involve AI agents in real-time development
- **Context Handoffs**: How to transfer development context between human and AI sessions
- **Code Review Integration**: AI agent participation in code review processes
- **Knowledge Transfer**: Documenting decisions and rationale for future AI sessions

### Human-AI Workflow Patterns
- **Planning Phase**: Human defines requirements, AI creates detailed workplans
- **Implementation Phase**: AI implements according to methodology, human validates
- **Review Phase**: Combined human judgment and AI consistency checking
- **Documentation Phase**: AI generates docs, human reviews for accuracy and completeness

### Rollback & Recovery Procedures

### When Development Goes Wrong
- **Immediate Assessment**: Identify scope of breakage (tests, build, functionality)
- **Rollback Decision Tree**: When to rollback vs. fix forward
- **Safe Rollback Points**: Identify last known good commit for each component
- **Impact Analysis**: Assess downstream effects of rollback decisions

### Recovery Strategies
- **Incremental Recovery**: Fix issues one component at a time in dependency order
- **Test-First Recovery**: Write tests that define expected behavior before fixing
- **Parallel Development**: Use feature branches to fix while maintaining main branch stability
- **Documentation**: Record what went wrong and how it was fixed for future prevention

## Quality Gates and Validation

### At Every Commit
- [ ] All tests pass
- [ ] Application builds successfully
- [ ] No linting errors or warnings
- [ ] No type errors or warnings
- [ ] Feature functionality works as expected

### Before Remote Push
- [ ] Complete feature set implemented and tested
- [ ] Full regression test suite passes
- [ ] Cross-component integration tests pass
- [ ] Performance benchmarks meet requirements
- [ ] Visual regression tests pass (if UI components)
- [ ] Security scan passes
- [ ] Documentation updated for any new or changed interfaces
- [ ] Code review checklist completed (if working with team)
- [ ] Performance impact assessed and acceptable
- [ ] Database migrations tested (if applicable)
- [ ] API contract compatibility verified
- [ ] Monitoring and alerting configured

## Agent Instruction Templates

### Workplan Creation Prompt
```
Create a detailed workplan for implementing [feature description]. The plan must:
1. Break down the feature into dependency-ordered steps
2. Identify all required components, types, and interfaces
3. Specify test requirements for each step
4. Define clear commit boundaries
5. Ensure the application remains working at every step
Format as a checklist with clear phase demarcations.
```

### Implementation Phase Prompt
```
Implement Phase [X] of the workplan for [feature name]:
- Current phase objective: [specific objective]
- Previous phase completion status: [status]
- Required deliverables: [specific items]
- Success criteria: [how to validate completion]
Follow TDD methodology and maintain working application state.
```

### Cross-Component Validation Prompt
```
Validate cross-component integration for [feature name]:
- Test all component interactions and data flow
- Verify mock consistency with real component interfaces
- Run end-to-end scenarios across multiple components
- Check performance impact of component composition
- Validate error handling across component boundaries
- Confirm monitoring and observability work correctly
Report any integration issues and remediation steps.
```

### Validation Phase Prompt
```
Validate current implementation status:
- Run all test suites and report results
- Verify application builds and runs successfully
- Test feature functionality manually
- Check for any regressions in existing features
- Confirm readiness for next phase or remote push
```

## Common Anti-Patterns to Avoid

### Development Process Anti-Patterns
- **Big Bang Implementation**: Never implement entire features in one commit
- **Test-After Development**: Never write implementation before tests
- **Broken State Commits**: Never commit with failing tests or build errors
- **Forward Reference Implementation**: Never implement features before their dependencies
- **Incomplete Feature Pushes**: Never push partially implemented features
- **Cross-Component Coupling**: Never create direct dependencies between components without proper interfaces
- **Environment Inconsistency**: Never deploy to production without testing in staging
- **Mock Drift**: Never allow mocks to become inconsistent with real component interfaces

### Agent Interaction Anti-Patterns
- **Vague Instructions**: Always provide specific, actionable instructions
- **Skip Validation Steps**: Always verify each phase completion
- **Ignore Dependency Order**: Always respect the dependency-first approach
- **Rush to Remote**: Always complete full feature sets locally first
- **Context Loss**: Never start new sessions without proper context transfer
- **Rollback Hesitation**: Never hesitate to rollback when issues are detected

## Success Metrics

### Process Quality Indicators
- **Zero Broken Commits**: Every commit maintains working application state
- **Test Coverage Maintenance**: Coverage never decreases during development
- **Dependency Clarity**: No circular dependencies or unclear requirements
- **Feature Completeness**: No half-implemented features in remote repository

### Agent Effectiveness Indicators
- **Clear Workplans**: Agents can create and follow dependency-ordered plans
- **TDD Compliance**: Red-green-refactor cycle followed consistently
- **Validation Thoroughness**: All quality gates passed before progression
- **Documentation Accuracy**: Implementation matches planned architecture

## Integration with Architecture Standards

This methodology works in conjunction with the Architecture Standards document to ensure:
- **Component Independence**: Each component developed can be tested in isolation
- **Interface Compliance**: Implementation matches interface contracts through TDD
- **Type Safety**: All types validated through comprehensive testing
- **Mock Reliability**: Component mocks proven through test usage

The combination of architectural standards (what to build) and this methodology (how to build it) creates a comprehensive framework for AI-assisted development that maintains enterprise-grade quality while enabling rapid, reliable feature delivery.