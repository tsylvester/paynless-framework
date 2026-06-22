# Error Handling
* Errors are explicitly typed.
* You do not guess at what type of error you have and use a ternary. YOU KNOW WHAT KIND OF ERRORS YOU MIGHT RECEIVE!  
* Errors are never converted, coerced, or otherwise modified. 
* Every error is surfaced, every single time. 
* Every error is for a single specific failure. 
* Errors explain EXACTLY what went wrong and EXACTLY where. 
* Errors are NEVER SWALLOWED. 
* Errors are NEVER STORED. 
* Errors are NEVER MODIFIED.
* You get an error, you pass the error along. 
* YOU DO NOT CHANGE THE ERROR OR HIDE THE ERROR! YOU SURFACE THE ERROR SO IT CAN BE FIXED! 