## MODIFIED Requirements

### Requirement: Autotest catalog and Case association
The system SHALL present tests under their project folder and file paths and
SHALL allow selecting one Case directly for each autotest identity.

#### Scenario: Several tests cover the same Case
- **WHEN** a tester selects the same Case for two different autotests
- **THEN** both associations are retained independently
- **AND** choosing a new Case for one does not change the other.

### Requirement: Reference book argument sets
The system SHALL allow selecting an existing typed arguments set and SHALL store
references to its values while preserving execution-time argument snapshots.

#### Scenario: Environment selection
- **WHEN** a tester selects a compatible Reference book arguments set
- **THEN** the next execution resolves values from that set
- **AND** past execution snapshots remain unchanged.

## ADDED Requirements

### Requirement: Dedicated run automation page
The system SHALL provide a run-specific test browser with per-test results and
actions to run one test, all associated tests, or tests whose latest result failed.

#### Scenario: Untested and failed tests
- **WHEN** a tester opens the run automation page
- **THEN** tests without results show Not run
- **AND** a previously failed but subsequently passed test is excluded from Run failed.
