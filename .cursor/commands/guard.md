Now write the guards to satisfy the guard tests. Follow the work plan descriptions exactly. 

Guards only test the types that are owned by the interface. Guards do not guard types imported from other interfaces! 

Guards guard every type in the interface - the function elements, plus any objects produced by the function. 

Imported types are guarded BY THEIR OWN GUARDS IN THEIR HOME PACKAGE. 