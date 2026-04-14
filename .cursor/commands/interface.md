Now write the interface exactly as described in the work plan. 

The interface must match this pattern: 

export interface myFunction: MyFunctionFn {
    deps: MyFunctionDeps
    params: MyFunctionParams
    payload: MyFunctionPayload
}: MyFunctionReturn = MyFunctionSuccess | MyFunctionError

That is a defined function name, a defined function signature ending with Fn, a typed deps object, a typed params object, a typed payload object, and a typed return object that is a discriminated union of a success response and an error response. 

Any object passed in to the function defined by the interface must have a type and that type must be defined in the interface of its owner (whatever the origin of the object is). 

Any object constructed by the function must be have a defined type and be composable. If the type is nested, each layer of the nest must be defined, typed, and composable. 

ExampleObject = {
    key1: Key1Type
    key2: Key2Type
}

Key1Type {
    subKeyA: SubKeyA
    subKeyB: SubKeyB
}

Key2Type = SomeOtherThing

This pattern recurses until a primitive is reached. 

Any object emitted by the function must be fully, completely defined, typed, and composed. Emitting untyped objects from the function is completely prohibited. Even primitives must be typed so that the receiving function knows what it's getting. 