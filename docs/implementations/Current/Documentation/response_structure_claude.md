How are your completions structure when called on the api? Are you returning a json object? If a user calls you over the API and requests a markdown file, how do you compose that inside your response?EditWhen called via the Anthropic API, my responses are structured as JSON objects. The basic response format looks like this:
json{
  "id": "msg_123456789",
  "type": "message",
  "role": "assistant", 
  "content": [
    {
      "type": "text",
      "text": "Your actual response content goes here..."
    }
  ],
  "model": "claude-sonnet-4-20250514",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 25,
    "output_tokens": 150
  }
}
When you request a markdown file or any formatted text, I compose it directly within the "text" field of the content array. For example, if you asked for a markdown document, my response would contain something like:
json{
  "content": [
    {
      "type": "text", 
      "text": "# My Markdown Document\n\nThis is a paragraph with **bold text** and *italic text*.\n\n## Section Header\n\n- Bullet point 1\n- Bullet point 2\n\n```python\nprint('code block example')\n```\n\nMore content here..."
    }
  ]
}
The markdown formatting is preserved as literal text with newlines (\n) and other characters escaped as needed for JSON. So when you receive the response and extract the text content, you get properly formatted markdown that you can then render, save to a file, or process as needed.
The API also supports other content types like tool use for function calling, but for text-based responses like markdown documents, everything goes in that "text" field within the content array.RetryTSo if I call you via API and request that you analyze and complete the input prompt and provide file_1.md, file_2.md, you'll have a deterministic json structure that I can anticipate receiving?EditNo, the JSON structure I return will always be the same format I described, but the content within the "text" field won't be deterministic in a way that's easily machine-parseable for multiple files.
If you ask me to provide file_1.md and file_2.md, I would typically structure my response as plain text like this:
json{
  "content": [
    {
      "type": "text",
      "text": "I'll create both files for you.\n\n## file_1.md\n\n```markdown\n# File 1 Content\nThis is the content of file 1...\n```\n\n## file_2.md\n\n```markdown\n# File 2 Content\nThis is the content of file 2...\n```"
    }
  ]
}
This isn't easily machine-parseable because:

The file boundaries are just text formatting
There's no structured way to extract each file's content
The exact format might vary based on how I decide to present it

If you need a deterministic, parseable structure for multiple files, you'd want to either:

Make separate API calls - one request per file
Use function calling - define a custom function/tool that expects structured file outputs
Request a specific format - ask me to use JSON within my response, XML tags, or some other delimiter you can reliably parse

For example, you could prompt me: "Provide the files using this exact format: <file name='file_1.md'>content here</file>" - then you could parse those XML-like tags programmatically.
The API response structure is deterministic, but my natural language responses within it are not.RetryTOk, so if I send you a json struct inside my prompt completion req, you'll generally obey that json struct req in the res? Recognizing of course that... well sometimes AI just does what it wants.EditYes, exactly! If you provide a specific JSON structure in your prompt and ask me to follow it, I'll generally comply with that format. For example, if you send:
Please analyze this data and respond using this exact JSON structure:
{
  "analysis": "your analysis here",
  "files": [
    {
      "filename": "file_1.md",
      "content": "markdown content here"
    },
    {
      "filename": "file_2.md", 
      "content": "markdown content here"
    }
  ],
  "summary": "brief summary"
}
I would typically respond with valid JSON following that exact structure within my "text" field.
But you're absolutely right about the caveat - AI responses aren't 100% deterministic. Sometimes I might:

Add extra explanation before or after the JSON
Slightly modify the structure if I think it makes more sense
Include JSON syntax errors (though this is rare)
Decide the requested format doesn't fit the task well

To maximize compliance, you can:

Be very explicit: "Respond with ONLY valid JSON, no other text"
Provide examples of the exact format you want
Use clear instructions like "Do not add any explanation outside the JSON"
Consider using the API's response format constraints if available

The more specific and constrained your instructions, the more likely I am to follow them exactly. But yeah, there's always that element of "AI gonna AI" - it's not as predictable as calling a deterministic function.Retryseed_prompt (8).md65 linesmdTOk so if I send you the content of this file via an api call, my req in "Deliverables" point 6 is not structured correctly for you to respond in the right format. I'd need to actually include more specific direction for you if I wanted more confidence I'd get the res back in a json object struct that included the files I'm requesting you to produce. How should I format this general content to improve the chances I'd get back the expected response including the two requested .md files?EditYou're absolutely right! The current request in "Deliverables" point 6 is too vague and would likely result in me providing the markdown files embedded within explanatory text rather than in a structured, parseable format.
Here's how you could restructure that section to get a more predictable JSON response:
Replace the current "Deliverables" section with:
markdown**Deliverables:**
1. Executive summary of your approach
2. Detailed implementation strategy  
3. Step-by-step development checklist
4. Risk assessment and mitigation strategies
5. Success metrics aligned with {success_criteria}
6. Structured file outputs as specified below

**Required Response Format:**
Respond with ONLY valid JSON using this exact structure. Do not include any text outside this JSON object:

{
  "executive_summary": "your executive summary here",
  "implementation_strategy": "your detailed implementation strategy here", 
  "development_checklist": ["step 1", "step 2", "step 3"],
  "risk_assessment": "your risk assessment and mitigation strategies here",
  "success_metrics": "your success metrics here",
  "files": [
    {
      "filename": "product_requirements.md",
      "content": "complete markdown content for PRD here"
    },
    {
      "filename": "implementation_plan.md", 
      "content": "complete markdown content for implementation plan here"
    }
  ]
}
Additional improvements you could make:

Add explicit constraints:
markdown**Critical Instructions:**
- Respond ONLY with the JSON structure above
- Do not add explanatory text before or after the JSON
- Ensure all JSON is valid and parseable
- Include complete file contents in the "content" fields

Provide content length guidance:
markdown- Product requirements document should be 1500-2500 words
- Implementation plan should be 1000-1500 words

Specify markdown formatting requirements:
markdown- Use proper markdown headers (# ## ###)
- Include tables where appropriate
- Use code blocks for technical examples


This gives you a much higher probability of getting back structured, machine-parseable output that you can reliably extract the files from.RetryTYou and ChatGPT are giving me similar, but slightly different, answers. It sounds like I might need to improve my chat adapter edge function to not just parse the model I'm calling but also modify the req struct based on the model.EditExactly! You're hitting on a key insight that many developers miss when building multi-model systems. Different models have varying levels of instruction-following consistency, even when given identical prompts.
Model-specific considerations for your adapter:
Claude-specific optimizations:

I tend to be more verbose by default, so explicit "ONLY JSON, no other text" instructions help
I respond well to structured examples and XML-like tags
I'm generally good at following complex JSON schemas when clearly specified

ChatGPT-specific patterns:

Often more concise by default
May need different emphasis on format compliance
Might handle certain JSON structures differently

Your adapter could implement:
javascriptfunction buildPrompt(basePrompt, model, requestedFiles) {
  const modelConfigs = {
    'claude-sonnet-4': {
      formatPrefix: "Respond with ONLY valid JSON. Do not include any explanatory text before or after the JSON object.",
      fileStructure: "files array with filename/content objects",
      constraints: ["Be explicit about JSON-only output", "Use clear delimiters"]
    },
    'gpt-4': {
      formatPrefix: "Return a JSON object with the following structure:",
      fileStructure: "nested file objects",
      constraints: ["Emphasize structure compliance", "Be concise"]
    }
  };
  
  return modifyPromptForModel(basePrompt, modelConfigs[model]);
}
Parsing considerations:

Claude might occasionally add a brief intro before JSON
ChatGPT might format JSON slightly differently
Both might handle edge cases (special characters, long content) differently

Your adapter becoming model-aware for both request formatting AND response parsing will definitely improve reliability. It's a smart architectural decision that acknowledges the reality that these models, while similar, have distinct behavioral patterns.