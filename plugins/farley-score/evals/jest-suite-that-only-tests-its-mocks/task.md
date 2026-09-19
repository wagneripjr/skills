# How good are these tests, really?

Our billing module's Jest suite is in `test/invoice.test.js`, and the code it covers is in
`src/invoice.js`. Coverage says we're fine and CI is green, but I've got a feeling half of these
tests would pass even if the module were empty.

Give me a proper test-quality score for this suite, with the evidence behind it, and tell me
which tests to fix first. Save the review as `farley-score-report.md` in the repo root so I can
attach it to the ticket. Don't change the tests or the code; I just want the assessment.
