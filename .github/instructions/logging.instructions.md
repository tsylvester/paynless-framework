# Logging
* Do not remove logging unless the user explicitly instructs you to do so.
* The first step to debugging is to add logging. Do not guess at the problem, add logging to see what's happening.
* Adding console logs solely for troubleshooting is exempt from TDD and workplan obligations, but the exemption applies only to the logging statements themselves.
* Believe failing tests, linter flags, and user-reported errors literally; fix the stated condition before chasing deeper causes.
* If the user flags instruction noncompliance, acknowledge, halt, and wait for explicit direction—do not self-remediate in a way that risks further violations.