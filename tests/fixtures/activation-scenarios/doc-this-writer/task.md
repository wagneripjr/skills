# Turn this codebase into specs I can hand to a test suite

I want one folder per unit, and in each one a requirements document, a design document and a
task list — written from what the code actually does.

The requirements need to be testable: Given/When/Then scenarios for every surface the unit
exposes, tagged by how you would drive them, with a file and line for each claim. Mark
anything the code cannot answer as an open gap instead of filling it in.

Do not invent requirements. Describe the ones that are already implemented.
