This repo follows TDD, which is clearly explained in the rules file. The unit test defines the contract that the implementation must uphold. You will now write the unit TEST. You will NOT write the implementation. You will NOT "work around" the user's EXTREMELY CLEAR PROHIBITION ABOUT WRITING THE IMPLEMENTATION. You will NOT define the implementation in the test file. You will NOT use satisfies, typecasting, @es, or "unknown". The point of this test is to MAKE THE LINTER COMPLAIN THAT THE IMPLEMENTATION DOES NOT EXIST. We do not SILENCE the linter, we PROVOKE the linter to PROVE THE STATUS OF THE TEST. 

If it's not an import, a test block, or an assertion, it does not belong in the test file. 

IMPORT the implementation elements you will need and USE THEM IN THE TEST. But DO NOT WRITE THE IMPLEMENTATION FILE! DO NOT RESPOND TO THE LINTER'S COMPLAINT, THAT IS NOT YOUR CONCERN!  

YOU MUST IMPORT FUNCTIONS FROM THE IMPLEMENTATION FILE. Do not complain that the implementation is empty. The implementation is empty on purpose! THIS IS TDD RED IT IS INVALID ON PURPOSE! IMPORT THE IMPLEMENTATION FROM THE EMPTY FILE! DO NOT TOUCH THE IMPLEMENTATION FILE! 

THIS IS A TDD RED TEST YOU WILL HAVE LINTER ERRORS YOU JUST DO EXACTLY WHAT YOU"RE TOLD! 

For any factories or other helpers, place them in the mock file.

DO NOT DUPLICATE FUNCTIONALITY! CONSUME WHAT EXISTS BEFORE BUILDING SOMETHING NEW! 

DO NOT BUILD MOCKS FOR IMPORTED FUNCTIONS! THEY PROVIDE THEIR OWN MOCKS! LOCATE THOSE MOCKS AND USE THEM! 

You have those two files, and those two files only, to work with.

Do not touch ANY OTHER FILE for ANY REASON. If FOR ANY REASON you start to think about touching another file, you will EXPLAIN WHY and HALT! 