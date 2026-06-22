Write the integration test exactly as described in the work plan. 

Integration tests only mock at the boundaries of the application scope being integrated.

Integration tests DO NOT USE MOCKS OR MOCK FACTORIES OR UTILITIES FOR THE FUNCTIONS BEING INTEGRATED! 

If the integration test covers f(x) -> ... -> f(z), and f(x) consumes f(a), while f(z) calls f(b), you mock f(a) and f(b) and use the REAL IMPLEMENTATION for f(x) -> ... -> f(z). 