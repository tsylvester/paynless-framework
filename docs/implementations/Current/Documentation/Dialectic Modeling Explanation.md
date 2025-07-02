Please read the AI Dialectic Implementation Plan. Consider 1.6 GitHub Integration. We need to create a standard output structure for our AI Dialectic application that is easily portable into any existing Github repo with minimal disruption of the existing application, and with maximum legibility and portability for the users. 

We have a five step process, hypothesis, antithesis, synthesis, parenthesis, and paralysis. 

These generally correspond to the idea, criticism, combination, documentation, and formalization. 

Each stage will be worked on by multiple AI agents. Each AI agent will get the same prompt from the user. Each agent will produce their own prompt completion which will be the agent's hypothesis (thesis) for the user prompt. The user will review these theses. The user may edit them directly, provide written commentary, analysis, or criticism. They can give each one a thumbs up or thumbs down, or a star rating. Whatever method the user feels is mot appropriate to provide feedback on the agent's response. 

Then the seed prompt, and each agent hypothesis and the users' response to it, are all packaged up and sent to each agent again for the antithesis. Each agent criticises every hypothesis, taking into account the user feedback. This means each agent produces three antithesis, for a total of nine. The user may edit, comment, or rate these antithesis. 

Then all hypotheses and user feedback, antitheses and user feedback are sent to each agent again. Each agent this time creates a synthesis, that incorporates all of the elements of the hypothesis, the antitheses, and all the user feedback, into a single version that takes all of that into account for the synthesis. This time, each agent provides one synthesis response that combines everything they've received. The user again edits, comments, or rates, as they see fit. 

Now all three syntheses are sent to each agent, and each agent is tasked with formalizing the synthesized materials into a comprehensive workplan that fully details everything that was provided in a logical manner. The user gets these parenthesis versions back, and again edits, comments, or rates as they see fit. 

Finally, each agent is sent all three syntheses, plus all the user feedback, in order to formalize and finalize the materials. Each agent reviews all materials and all feedback and produces their attempt at a final version. 

This is a generic template for producing multi-agent dialectic analysis from a user's base prompt. It has applications across essentially all knowledge work. At each step in the cycle, the user can choose to iterate by having the models reevaluate their materials based on the users feedback, until the user is satisfied with the output. 

The specific version we are implementing immediately is primarily to improve software development planning, documentation, administration, and performance. This may be by traditional human coding, or through AI-human pair coding. 

Resolving this generic model to a concrete implementation produces a few new expectations. 

In the first round hypothesis, the agent's objective is to translate the user prompt into a fulsome product requirements document, business case, user stories, market overview, and brief implementation plan. Basically to help the business decide if the hypothesis is worth pursuing. 

In the second round antithesis, the agent's objective is critical analysis of the gaps, shortcomings, oversights, and unsupported assumptions made by the agents. What did they miss or do incorrectly, basically. The objective here is a criticism and refinement to the original materials. 

In the third round synthesis then takes all of these into account and produces the final version of the PRD, brief business case, user stories, and market overview. On the assumption that the user will want to proceed, the original brief implementation plan is expanded significantly to ensure it covers all high level concerns for building out the software. 

In the fourth round parenthesis, the business concerns are set aside. The objective is to fully detail the initiatives, epics, stories/tasks, and sprints required to implement the PRD from the synthesis. This implementation plan is sliced into topical areas (for examples, database tables, columns, RLS policies, triggers, hooks, functions, backend function groups, middlware packages like API, store, and utilities, and UI component groups) then fully detailed down to each specific work-step as deeply and comprehensively as possible. 

The parenthesis can get extremely long, so at this stage, it's not uncommon that the user will only want a single group of tasks to be fully detailed at a time, then the user will want to iterate through each group of tasks to get comprehensive implementation details for each group until all groups are completely detailed. 

For the final paralysis round, the objective is to concretely plan the entire implementation as accurately and fully as is possible. This includes creating a project plan that may be embodied as a checklist, or a gantt chart, or a Jira work dependency graph, depending on how the user prefers. The first, a checklist, may simply be a series of ordered markdown files. The gantt chart or Jira work dependency graph may be structured as a .csv file or other importable file that includes fields like dependencies, estimated duration, finish-to-start, start-to-start, finish-to-finish, developer assignments, and so on. The work output needs to be structured as red-test/implement/green-test/commit step by step. It needs to be fully dependency-ordered so that proceeding along the graph guarantees that the user never has to halt, skip forward, or jump around to other areas before returning to their prior location to continue. 

For the moment we will focus on a simpler checklist concept. The agents need to review and model the checklist against its implicit and explicit dependencies, and output each step in the checklist as a prompt that the developer can provide to an AI agent, and the AI agent will correctly build the work described by the prompt, in a way that is compatible with the overall project, its requirements, the work already performed, and the work not yet performed. A checklist will not require parallelization of work, as it is implicitly linear and single-threaded, but deconstructing the work into a gantt chart or jira plan will require identifying parallelization or independencies so that multiple workers can work concurrently. 

You and I have been using this model for months now to build the very software that automates the process. The AI Dialectic Implementation Plan is an example of one of the checklists we've built using this process. 

Now we are at the stage of creating a Github integration to export our automation's markdown file output (and later, csv files or other Project Management / Jira compatible files) to an arbitrary new or preexisting Github repo so that our users can use the method we're building together. 

We need to develop a standard folder model for this kind of work that we can populate into any Github repo. 

Here's what I'm thinking, please criticise my ideas and provide improvements. 

/Planning/
./Hypothesis 
-> SeedPrompt //from user
-> projectName-modelName-hypothesis.md //repeat for all models used
-> UserResponse //from user
-> Hypothesis documents
./Hypothesis/Documents
--> projectName-modelName-PRD.md //repeat for all models used
./Antithesis
-> SeedPrompt //from user, bundled Hypothesis files and user responses as described before
-> projectName-modelName-antithesis.md //repeat for all models used
-> UserResponse //from user
./Synthesis
-> SeedPrompt //from user, bundled Hypothesis + response, Antithesis + response, as described before
-> projectName-modelName-synthesis.md //repeat for all models used
-> UserResponse //from user
./Synthesis/Documents
--> projectName-modelName-PRD.md //repeat for all models used
--> projectName-modelName-implementation-plan.md //repeat for all models used
./Parenthesis
-> SeedPrompt //from user, bundled Synthesis + response, as described before
-> projectName-modelName-parenthesis.md //repeat for all models used
-> UserResponse //from user
./Parenthesis/Documents
--> projectName-modelName-implementation-plan.md //repeat for all models used
./Paralysis
-> SeedPrompt //from user, bundled Parenthesis + response, as described
-> projectName-modelName-paralysis.md //repeat for all models used
-> UserResponse //from user
./Paralysis/Documents
--> one or multiple files logically named and ordered based on the final output produced 
/Implementation/
-> The user copies or imports the specific set of work they're currently working on into this folder. 
/Complete/
-> The user copies or imports the work that's already been done into this folder. 

The structure is intended to be readily understood by both developers and AI agents. The purpose of the final "Implementation" and "Complete" folders is to make it explicitly clear where exactly in the work plan the developers are so that other developers or an AI agent can step into the project at any time and begin assisting. 