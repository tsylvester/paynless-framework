Update the mock file to move any factories, builders, or helpers out of tests and into the mock so they can be used by callers. 

Mocks are named as mock[FunctionName] or mock[Object]. Do not add additional styling. Do not chain additional descriptors like `mockBuildContractStandardDefaultNoOverrides` or other useless verbosity. 

The mock file must provide a builder for each element of the function signature, for example deps, params, payload, returns. 

Each builder must provide a default value and accept an override for each value it owns, including undefined or null, for any value that is a member of the object. 

Do not build mocks specific to a single override value. We do not want `mockFunctionMissingSomeDependency`. That is what the default type and override values are for. 

The plain mock factory defaults must suffice for the interface test. The interface test depends only on the interface, not on specific implementation details. 

The mock factory plus selected overrides must suffice for the type guards, unit tests, and integration test boundaries. 

If you find yourself writing `mockFunctionContractDeps` for the interface test, then `mockFunctionGuardDeps` for the type guard, then `mockFunctionUnitDeps` for the unit tests, that means you have completely ignored the requirements for producing a default mock with overrides. 

Do not write mocks for FunctionA that repackage a mock for FunctionB - the FunctionB mock will be obtained from mockFunctionB. 

Do not write mocks that wrap and reprovide existing mocks - `mockFunctionMissingDeps` as a wrapper for `mockFunctionDeps delete missingDep` is invalid. That is what the overrides are for, and why overrides must accept null and undefined. 

Every object handled by the function must have a defined type and a mock. The mock for the namespace only mocks the functions and objects defined in the interface for the namespace. mockFunctionX never provides mocks for objects defined in the interface for FunctionY - mockFunctionY is owned by FunctionY. 

Ensure that the mock is complete and provides the entire controllable function and type surface so that callers can correctly mock the function for interface, guard, unit, and integration tests tests. 