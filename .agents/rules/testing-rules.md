# Targeted Testing Rule

To optimize execution speed and conserve token usage:

1. **Do Not Run the Entire Test Suite**: Do NOT run tests for the entire application/program on every turn or for minor changes to avoid wasting time and tokens.
2. **Only Test Affected Areas**: Carefully analyze which components, files, and logic paths are affected by the changes, and test only those specific test cases/files.
3. **Exceptions for Massive Changes**: You are only allowed to run the entire test suite if there is a massive, cross-cutting change that warrants wide validation. Otherwise, restrict testing to targeted tests only.

