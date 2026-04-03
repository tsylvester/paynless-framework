This repo follows TDD, which is clearly explained in the rules file. The interface test defines the contract that the interface must uphold. You will now write the interface TEST. You will NOT write the interface. You will NOT "work around" the user's EXTREMELY CLEAR PROHIBITION ABOUT WRITING THE INTERFACE. You will NOT define the interface in the test file. You will NOT use satisfies, typecasting, @es, or "unknown" for everything. The point of this test is to MAKE THE LINTER COMPLAIN THAT THE INTERFACE DOES NOT EXIST. We do not SILENCE the linter, we PROVOKE the linter to PROVE THE STATUS OF THE TEST. 

If it's not an import, a test block, or an assertion, it does not belong in the test file. 

IMPORT the interface elements you will need and USE THEM IN THE TEST. But DO NOT WRITE THE INTERFACE FILE! DO NOT RESPOND TO THE LINTER'S COMPLAINT, THAT IS NOT YOUR CONCERN!  

YOU MUST IMPORT THE INTERFACE TYPES FROM THE INTERFACE FILE. Do not complain that the interface is empty. The interface is empty on purpose! THIS IS TDD RED IT IS INVALID ON PURPOSE! IMPORT THE TYPES FROM THE EMPTY INTERFACE FILE! DO NOT TOUCH THE INTERFACE FILE! 

THIS IS A TDD RED TEST YOU WILL HAVE LINTER ERRORS YOU JUST DO EXACTLY WHAT YOU"RE TOLD! 

An interface test proves that the interface implements the defined shape contract. 

An interface test DOES NOT use type guards, import type guards, or act as a type guard. 

An interface test DOES NOT rely on implementation details. 

For any factories or other helpers, place them in the mock file. 

DO NOT DUPLICATE FUNCTIONALITY! CONSUME WHAT EXISTS BEFORE BUILDING SOMETHING NEW! 

DO NOT BUILD MOCKS FOR IMPORTED FUNCTIONS! THEY PROVIDE THEIR OWN MOCKS! LOCATE THOSE MOCKS AND USE THEM! 

You have those two files, and those two files only, to work with.

Do not touch ANY OTHER FILE for ANY REASON. If FOR ANY REASON you start to think about touching another file, you will EXPLAIN WHY and HALT! 