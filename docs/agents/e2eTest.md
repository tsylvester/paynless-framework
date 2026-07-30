# End-to-end test

Part of the [Tests](tests.md) topic; the [shared standards](tests.md#shared-standards-all-test-files)
apply here. Governed by all Process topics.

Reserved for real end-to-end validation of the full stack against real infrastructure.
Keep E2E tests minimal and run them in a dedicated, isolated pipeline — they are not
part of the ordinary node cycle. Reach for one only when a behavior genuinely cannot be
proven at the unit or integration tier.
