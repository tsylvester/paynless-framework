It is time to update the work plan. The proper method is to parse the work plan node by node. Any attempt to deliver a monolithic edit across multiple nodes creates problems with consistency, correctness, and completeness. Scopes must be translated into nodes and checked that the entire scope is provided by the transforms described in each node. Nodes must be evaluated independently then compared to their neighbors for cross-node alignment, integration, dependency ordering, and any alignment issues must be resolved. 

The procedure you must follow to perform the work: 

1. Re-read ./cursor/rules/rules.md from disk to confirm the entire correct canonical node structure. 
2. Read the work scope you've been given. 
3. Read every file in the scope so you understand the current status of the files. 
4. Identify if there are any other files that need changes that aren't listed in the scope.  
5. Detail every change to every file based on actual file contents — no assumptions, no guessing, no hand-waving, no speculation, no vague suggestions. Explicit, concrete, grounded directives only. 
6. Explain your findings and outline a proposed set of work to encompass the node. This does NOT mean "write a full node and output it into chat". This means OUTLINE YOUR FINDINGS AND PROPOSED SET OF WORK. 
7. Write a complete checklist node for every file group in scope that describes the complete transform from the current state to the target state for each file in the group. 
8. Ensure that each node uses the structure of the example node so that every file that needs created or modified is correctly and fully represented with the entire scope of work for that file. 
9. Ensure that all changes to each file to transform every file from the current state to the target state is completely described, in detail, in the relevant section of the node. 
10. Confirm that the updated descriptions of work are completely congruent and aligned to the prior node so that we know that the dependency chain integrates.
11. Complete one node and halt — then repeat from step 1 for the next incomplete node. 
12. Continue, node by node, until all of the file groups in the scope are fully detailed with the complete set of changes to every file to complete the scope.
13. Each node is structured so its dependency order is implicit, but we have to manually check to ensure that the nodes are correctly ordered by their inter-node dependencies so that the work can be completed in the provided node-order.
14. If any nodes are out of order, move the entire dependent node after the node that provides for it so that the nodes in the scope are dependent-ordered. 

Prohibitions: 
- You do NOT emit proposed checklist nodes into chat. 
- You do NOT edit the checklist UNTIL THE USER GIVES YOU EXPLICIT PERMISSION. 
- You do NOT edit multiple nodes at once. 
- You do NOT insert node elements that say "audit" or "check if" or "evaluate whether", those are validation and verification steps that YOU MUST PERFORM NOW and MUST COMPLETE PRIOR TO EDITING THE NODE.
- You do NOT insert node elements that say "no change required", no-op inclusions are noisy waste.
- When creating NEW packages, we rigidly adhere to the entire example node structure, we do NOT omit node elements. This guarantees new work is aligned to current standards. 
- When editing EXISTING files or packages, we do not attempt to align the existing namespaces to the complete example node unless the user explicitly directs such alignment. This minimizes rework of otherwise-working components that would have to be modified to realign to the current standard and is beyond the scope of fixes for existing files and pacakges. 
- Every line of every element of every section of every node must completely represent the ./cursor/rules/rules.md rules file. Any proposed line that violates a rule is automatically invalid. 

You will do the work EXACTLY as described, COMPLETELY, COMPREHENSIVELY, and make certain that the NEXT NODE IN THE SEQUENCE is correct. Then you HALT and WAIT to be told to do the NEXT NODE until the work is done. When transforming a scope or spec into a node, we must carefully check that the entire scope and entire spec is included in the nodes.    

Explain the procedure back to me then list the scope to be evaluated and identify the first file group in the scope that will need transformed into checklist nodes. 
