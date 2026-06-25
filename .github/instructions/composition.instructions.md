# Function Composition
* All new functions have defined signatures, deps, params, payload, returns
  exampleFunction: ExampleFunction {
    exampleDeps: ExampleDeps;
    exampleParams: ExampleParams;
    examplePayload: ExamplePayload;
  }: ExampleReturn = ExampleSuccessReturn | ExampleErrorReturn
* Agents cannot place deps inside params, blob params and payload, or invent other types to define the function. 
* Agents cannot ignore a required element just because the function doesn't use it RIGHT NOW. Supply it anyway. 
* Agents cannot decide "this function will never have errors, only return the SuccessReturn". That's not your call. THE RETURN IS A UNION ON PURPOSE! 
* This pattern applies to a function that is exported so that it can be consumed elsewhere. 
* This pattern guarantees that the function is compliant with DI to enable testing. 
* Existing functions do not need to be converted to this pattern. 
* Internal functions and helpers do not require this pattern. 
