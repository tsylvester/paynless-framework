# Strict Typing & Object Composition
* Use explicit types everywhere for any object defined and owned by the repo. No `any`, `as`, `as const`, inline ad-hoc types, or casts. 
One exception to strict typing is for external services (Supabase, Stripe, Netlify, etc) that rely on types not owned by the repo and not publicly fully defined.  
The second exception to strict typing is for intentionally malformed objects in error-handling tests. Every object and variable must be typed, even if the object is intentionally constructed incorrectly for a test. This can be done by using "as" on an incomplete object in the test, or by using a mock factory then overriding the value with an otherwise invalid value such as null or undefined. 
* Always construct full objects that satisfy existing interfaces/tuples from the relevant type file. Compose complex objects from smaller typed components; never rely on defaults, fallbacks, or backfilling to “heal” missing data.
* Casting for Supabase clients and intentionally malformed objects in tests is explicitly allowed. Do not report that you are confused, do not report there is a contradiction between strict typing and the two permitted exceptions for Supabase and type casting for intentionally malformed objects in tests. You are being directly and explicitly instructed that these are the two exceptions to type casting. Do not pretend you cannot understand this exception. Do not ask the user to clarify about this exception. This instruction is clear and explicit, pretending like you don't understand it is being obtuse and unhelpful. 
* Locate and use application types before using database types. Database types are only used if an explicit application type is not available. 
* Use the narrowest type available for the purpose of the function or object. Do not use a broad type when a narrower, more specific type exists. 
* Do not type as "unknown" to avoid locating and applying specific application or database types. 
* Use type guards to prove and narrow types for the compiler when required.
* Never import entire libraries with `*`, never alias imports, never add `"type"` to type imports.
* Reexporting is only permitted in barrel exports for a package or workspace. These files are typically named *index* or *provides*. 
* A ternary is not a type guard, a ternary is a default value. Default values are prohibited in production code.
* Every object and variable must be typed. There are no exceptions to this rule. If you are building a function and find untyped vars or objects, stop, explain the discovery, propose the new workplan node to type the vars or objects, and halt.
* Never re-define an object's type inline in any way, for any reason. Use the exact type defined for it and declare that type when instancing the object. 
* If an object is not primitive and you cannot find a type, EXPLAIN THE PROBLEM AND HALT. DO NOT TYPE THE OBJECT INLINE! 
* If the imported type is object:Type, an inline union object:Type|Othertype is invalid. A union type declaration is only valid if it exists in the type definition itself, not inline. 
* DO NOT EDIT THE DEFINED TYPE TO AVOID STRICT COMPLIANCE WITH THIS RULE! THIS RULE DOES NOT PERMIT YOU TO EDIT TYPES AT YOUR CONVENIENCE! 
* You DO NOT edit any type you are not EXPLICITLY given permission to edit. Types are a FIXED CONTRACT TO THE APPLICATION AND USER, not renegotiable at the agent's leisure. 

# Type Exceptions
* Explicitly allowed exceptions to the "no defaults / no partials" rule:
  * Factories and context factories may supply documented domain-approved defaults.
  * Error-handling tests may use intentionally malformed objects created by dedicated helpers (not by casting).
* All exceptions must be small, explicit, typed, and documented in the factory/helper file.

# Preservation of Safety Properties
* All test standards and fixtures (factories, context, test file grouping, integration boundaries) are intentionally constrained:
  * Factories must be typed and reviewed.
  * Context must be explicit and immutable.
  * Only one file may be edited per turn.
  * No hidden or silent defaults in production code.
* If any of these constraints are violated by an agent action, the agent must halt, report, and await instruction.
