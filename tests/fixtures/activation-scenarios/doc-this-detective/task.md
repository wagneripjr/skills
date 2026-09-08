# What business rules are hiding in this code?

Nobody wrote these down. They are implied by the code and I need them stated.

Pull out:

- the business rules the implementation actually enforces, each with the file and line that
  proves it
- any state machine — what states exist and what transitions are allowed
- who is allowed to do what, if there is anything resembling permissions
- which endpoints are reachable from outside and which are internal

Cite everything. If the code does not answer something, say so rather than guessing.
