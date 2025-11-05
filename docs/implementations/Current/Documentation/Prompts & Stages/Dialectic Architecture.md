# This portion basically works, no suspected errors here 

createProject (UI)-(dialectic-service)-(UI)
- Creates a new project in the database that links to the user and uniquely identifies their project 
- The user chooses a dialectic_domain that determines what their workspace is and what process will be used
- The project is assigned a dialectic_process_template that defines what kind of project the user is building
- These dialectic_domain and dialectic_process_template determine the dialectic_stages and dialectic_stage_transitions that the sessions will follow
- The user supplies their initial user prompt which explains their objective outcome for the project 

startSession (UI)-(dialectic-service)-(UI)
- Creates a new session within a project that enables the user to begin the dialectic
- The user's initial prompt is taken and blended with the domain_specific_prompt_overlay to generate a Seed Prompt for the stage
- The user is navigated to the session page that shows their session details, Seed Prompt, Stages, selectors for models, and the Generate Contribution button 

generateContribution (UI)-(dialectic-service)-(dialectic-worker)-(UI)
- Takes the user's seed prompt for their current stage. 
- Populates jobs on the dialectic_generation_jobs table for performing the stage. 
- Sends notification to UI that the contributions are being generated

# There are errors suspected in this section, that the prompt is not being assembled correctly for the stage somewhere in here.  

## processJob is suspected of mishandling the prompt components and failing to pass in the full prompt to executeModelCallAndSave

processJob (dialectic-worker)-(_shared)
- Picks up jobs on the jobs table and processes them
- Jobs have the user's seed prompt, which is the stage-specific prompt materials
- Jobs have sourceDocuments, which are artifacts provided by the user or prior stages that are required for the model to generate the stage contributions 
- Calls prompt-assembler to combine all the materials into the single prompt to be sent to the model 

- **ARCHITECTURAL ERROR:** For simple jobs, this function **FAILS** to implement the correct architecture.
- Picks up jobs on the jobs table and processes them.
- Correctly gathers `sourceDocuments` using the `promptAssembler`.
- **FAILURE POINT:** It **DISCARDS** the gathered `sourceDocuments` and instead only fetches the static `seed_prompt`. It does **NOT** call the `promptAssembler` to combine these materials.
- It then calls `executeModelCallAndSave` with the incomplete seed prompt and the unused `sourceDocuments` array.

TEST POINT(s): 
1.  **System Integration Test: Prove History Masking by Disabling `chat_id`**
    -   **Location:** `supabase/functions/dialectic-service/callModel.ts`
    -   **Description:** This is a business logic change and a diagnostic test. We will modify `callUnifiedAIModel` to *never* pass a `chat_id` for dialectic jobs. This is critical because `chat` will greedily assemble a history if it receives a `chat_id`, which we must prevent to stop it from masking upstream failures.
    -   **Expected Red Result:** With the `chat_id` disabled, the end-to-end `paralysis` stage will fail. The AI model will produce a nonsensical, low-quality output because it will only receive the short, static seed prompt instead of the fully assembled context. This definitively proves the prompt construction is broken and was being masked by chat history.

2.  **Unit Test: Assert `promptAssembler.assemble` IS Called**
    -   **Location:** Add a new test to `supabase/functions/dialectic-worker/processSimpleJob.test.ts`.
    -   **Description:** This test will assert that `processSimpleJob` calls the correct assembly method, `promptAssembler.assemble`, as the architecture requires. We will spy on this method.
    -   **Expected Red Result:** The test will fail. The assertion `assertEquals(assembleSpy.calls.length, 1)` will fail because the call count will be 0. This provides the most direct, upstream proof of the bug. When fixed, the test will turn green and prevent regression.

3.  **Unit Test: Assert Complete Prompt is Passed**
    -   **Location:** Add a new test to `supabase/functions/dialectic-worker/processSimpleJob.test.ts`.
    -   **Description:** This test will assert that the *consequence* of the fix works as intended. We will mock `promptAssembler.assemble` to return a prompt containing a unique evidence string. We will spy on `executeModelCallAndSave` and have the test log the content of the received `renderedPrompt`.
    -   **Expected Red Result:** The test will fail. The assertion `assert(promptContent.includes('EVIDENCE_STRING'))` will fail. The log output will visually confirm that the prompt is missing the required materials.

## prompt-assembler is suspected of either not receiving the documents, or not constructing the prompt correctly from the documents it receives 

prompt-assembler (_shared)-(dialectic-worker)
- Takes the seed prompt and resourceDocuments
- Calls prompt-renderer to transform them into a single cohesive complete prompt object 
- Returns the prompt to the processJob function
- **CURRENT STATE:** This component is behaving correctly but is being used improperly by `processSimpleJob`.
- It correctly provides `gatherInputsForStage` to collect source documents.
- It correctly provides an `assemble` method to combine a seed prompt with gathered documents.
- The failure is that `processSimpleJob` does not call the `assemble` method.

TEST POINT(s): 
- No test points needed here. The component is not in error; its callers are.

# It's believed that, at this point, the prompt is not actually assembled, or if assembled, not passed onward. It's believed this section demonstrates the error when the RAG fails to be triggered for the too-large prompt, because the prompt that the executeModelCallAndSave processes is NOT too large, since it's mis-assembled. 

executeModelCallAndSave (dialectic-worker)-(dialectic-service)
- Receives the assembled prompt 
- Checks it against the RAG for size
- Runs the RAG if it's too big (THIS MAY BE A LOGIC ERROR! The user's prior input should be RAG'd while maintaining the current stage prompt in its entirety)
- callModel is called with the size-checked prompt 

- **ARCHITECTURAL ERROR:** This function receives an incomplete, unassembled prompt from `processSimpleJob`.
- It performs a token check on this incomplete prompt.
- **FAILURE POINT:** Because the prompt is small, the token check passes, and the RAG logic is **never triggered**, rendering it useless.
- It then passes the small, incomplete prompt to `callModel`.

TEST POINT(s): 
1.  **Unit Test: Prove Flawed Token Calculation**
    -   **Location:** Add a new test to `supabase/functions/dialectic-worker/executeModelCallAndSave.test.ts`.
    -   **Description:** This test will prove that the token check ignores the `sourceDocuments` and only evaluates the `renderedPrompt`. We will pass a short `renderedPrompt` but a `sourceDocuments` array containing a single, massive document that would exceed any token limit. We will spy on the internal `countTokens` function and have the test log the content it was called with and the resulting token count.
    -   **Expected Red Result:** The test will fail. The RAG service will not be called. The assertion `assert(ragSpy.calls.length > 0)` will fail. The log output will visually confirm that `countTokens` was only called with the short prompt content.

# This section is probably innocent, there's no reason to believe callModel is misbehaving. 

callModel (dialectic-service)-(chat)
- Receives the prompt
- Has the array of models chosen for the stage
- Iterates across the array of models and calls chat for each model 
- **CURRENT STATE:** This function is behaving as designed. It receives a prompt and passes it to `/chat`. Its behavior is not erroneous.

# This is where the error is explicitly demonstrated in that the call /chat is trying to make is too large for the model to receive. The error MUST occur before this segment. It may be masked by chat constructing a message history that can disguise the prompt is not constructed properly. 

chat (chat)-(ai_service)
- Receives the prompt and model call 
- Checks the chat_id
- Pulls the chat history for that chat_id
- Adds the history to the model call for context
- Checks the prompt length against the model's config
- Checks if the user can afford to send the prompt
- Calls the model using the adapter 
- **CURRENT STATE:** This function behaves as designed but its history-loading feature masks the upstream bug.
- When it receives a `chat_id`, it pulls the entire message history for that chat.
- It then appends the new (and in our failing case, very short) message to this long history.
- This fully-loaded history is what gets sent to the AI, causing the token limit error.

TEST POINT(s): 
1.  **Unit Test: Prove Chat No Longer Receives `chat_id`**
    -   **Location:** Add a new test to `supabase/functions/dialectic-service/callModel.test.ts`.
    -   **Description:** After we implement the business logic change to remove the `chat_id`, this test will ensure that `callUnifiedAIModel` never sends a `chat_id` in its payload to the `/chat` function for dialectic jobs. We will spy on the `fetch` call made to the `/chat` function.
    -   **Expected Green Result:** The test will pass by asserting that the `chatId` property in the JSON body of the request is `undefined`. This acts as a regression test to ensure the history-masking bug can never be accidentally reintroduced.

# This portion basically works, no suspected errors here 

ai_service (ai_service)-(model adapter)
- Receives the prompt and model
- Uses the factory to build the adapter for the call 
- Passes the prompt into the adapter 
- Receives the response from the model  
- Receives the cost from the model 
- Returns the completion and cost to chat

chat 
- Completes the token transaction
- Saves the completion to the users chat history
- Passes the response to callModel

callModel
- Passes the response to executeModelCallAndSave

executeModelCallAndSave
- Receives the response from the model
- Calls file_manager to save the response to the storage bucket 
- Adds a row to the notifications table that the completion is available 

notifications
- Receives the new row
- Passes the message forward to the store

store
- Gets the notification
- Updates its store values

UI 
- Sees the store values updated
- Updates the UI with new values 
