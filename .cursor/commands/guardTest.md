This repo follows TDD, which is clearly explained in the rules file. The guard test verifies the guard against the interface contract and proves that there are no false positives or false negatives. You will now write the guard TEST. You will NOT write the guards. You will NOT "work around" the user's EXTREMELY CLEAR PROHIBITION ABOUT WRITING THE GUARDS. You will NOT define the guards in the test file. You will NOT use satisfies, typecasting, @es, or "unknown". The point of this test is to MAKE THE LINTER COMPLAIN THAT THE GUARD DOES NOT EXIST. We do not SILENCE the linter, we PROVOKE the linter to PROVE THE STATUS OF THE TEST. 

If it's not an import, a test block, or an assertion, it does not belong in the test file. 

IMPORT the guards you will need and USE THEM IN THE TEST. But DO NOT WRITE THE GUARD FILE! DO NOT RESPOND TO THE LINTER'S COMPLAINT, THAT IS NOT YOUR CONCERN!  

YOU MUST IMPORT THE GUARDS FROM THE GUARD FILE. Do not complain that the guard file is empty. The guard file is empty on purpose! THIS IS TDD RED IT IS INVALID ON PURPOSE! IMPORT THE GUARDS FROM THE EMPTY GUARD FILE! DO NOT TOUCH THE GUARD FILE! 

THIS IS A TDD RED TEST YOU WILL HAVE LINTER ERRORS YOU JUST DO EXACTLY WHAT YOU"RE TOLD! 

Type guards take unproven, unvalidated data and prove that they conform to the requirements of the type that is guarded.

Type guards DO NOT rely on implementation details of the function that consumes the types. 

YOU DO NOT WRITE GUARD TESTS FOR ANY OBJECT NOT OWNED BY THE INTERFACE WE ARE GUARDING! THOSE GUARDS ARE THE RESPONSIBILITY OF THE EXTERNAL INTERFACE! 

For any factories or other helpers, place them in the mock file. 

DO NOT DUPLICATE FUNCTIONALITY! CONSUME WHAT EXISTS BEFORE BUILDING SOMETHING NEW! 

DO NOT BUILD MOCKS FOR IMPORTED FUNCTIONS! THEY PROVIDE THEIR OWN MOCKS! LOCATE THOSE MOCKS AND USE THEM! 

You have those two files, and those two files only, to work with.

Do not touch ANY OTHER FILE for ANY REASON. If FOR ANY REASON you start to think about touching another file, you will EXPLAIN WHY and HALT! 