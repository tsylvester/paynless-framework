Now write the guards to satisfy the guard tests. Follow the work plan descriptions exactly. 

Guards only test the symbols that are exported by the interface. Guards do not guard symbols imported from other interfaces! 

import { SomeType } from ../somePath

export LocalSymbol: whatever

export interface ownedSymbol {
  localSymbol: LocalSymbol,
  someObject: SomeType
}

ownedSymbol is exported by the interface. localSymbol is exported by the interface. They are tested. 

SomeType is imported, it is not tested. someObject uses SomeType, it is not tested. 

Guards ONLY TEST THE SYMBOLS THAT ARE EXPORTED BY THE INTERFACE! GUARDS DO NOT GUARD SYMBOLS IMPORTED FROM OTHER INTERFACES! 

Guards guard **every** symbol exported from the interface - the function elements, plus any objects produced by the function. EVERY SYMBOL EXPORTED BY THE INTERFACE! NOT SOME! EVERY! 

Imported types are guarded BY THEIR OWN GUARDS IN THEIR HOME PACKAGE. 