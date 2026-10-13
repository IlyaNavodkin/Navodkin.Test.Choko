# Feedback and Feature Requests

## Workspace Changes

- Add workspace actions (add workspace, edit workspace, remove workspace) to File menu in the title bar. Add should select a folder and then open the edit modal (dropdown with each workspace, the new one already selected). Edit should open the same modal but with the current name and description filled in. Remove should ask for confirmation and then remove the workspace (delete the casewright.yaml file, no other changes).

## Test Case Schema Changes

- Add "Setup" section to test cases (after "Systems in Scope" and before "Steps"). Should be a list with header (H3, ###) and body (multi-line markdown, disable h1-h3 headings). Users should be allowed to reorder the lists similar to "Systems in Scope". Editor for each item should be the name with the body underneath.

## Test Runs Changes

- When creating a test run, merge the "From workspace" and "from suite" into one option that shows a checkbox list of each workspace and suite (nested). This would allow a user to select workspaces, suites, or individual test cases to include in the run (and also uncheck any test cases they don't want to include).

- Update run to track checked steps, etc. so leaving and coming back to a run everything checked is still checked. This should be preserved in test-specific sidecar markdown files for the run, so if a user opens the file in an editor they can see the state of each test case and step. This also avoids issues with changes to the test impacting old runs. So now a run should be a folder that contains a markdown file for the run details (tested by, date, etc.) and then a markdown file for each test case that contains the state of the test case (passed, failed, etc.), the state of the checkboxes for each item (setup, steps, acceptance criteria, etc.) and any notes about it.

- Update the Run Details page so that one section is a table of the test cases, but that it also has a summary section, approval section (tester and reviewer), and a section for general notes about the run.
  - The Tester Approved Button should save name and date/time to markdown sidecar.
  - The Reviewer Approved Button should save name and date/time to markdown sidecar.

- Add a "Rerun" button to create a new instance of an existing run. Copy over the test cases, but reset the approval state and notes so that it's ready for a new run.

- Add a third state (failed) to the checkboxes in runs. Clicking will cycle through the states. This will allow testers to mark steps as failed/blocked for easier tracking and reporting. This should also be preserved in the markdown sidecar for each test case in the run. Use [ ] for empty, [x] for passed, and [-] for failed.

- When running a test case and the result is set to a non-passing state, show a copy-able defect section below to allow the user to easily paste into work item tracking system (devops, jira, etc.). Use the state of the checks above to help provide background info. It should provide the test name, test details, and the steps that were marked as failed with a description of the failure (if provided by the tester). This should be copy-able so that the tester can easily paste into their work item tracking system (devops, jira, etc.) and then link back to the run in casewright for easy reference.

## Test Variables Support

- Create support for a {{today}} variable that can be used in test cases and will be replaced with the current date when the test case is run. This will allow users to create test cases that are more dynamic and can be reused without needing to update the date each time. This should also support date math, so {{today+7}} would add 7 days to the current date, {{today-30}} would subtract 30 days from the current date, etc. This should be supported in all markdown fields for test cases (setup, steps, acceptance criteria, etc.) and should be replaced with the correct value when the test case is run in a test run. When running a test case there should be a dropdown for the test date that defaults to the current date but can be changed by the tester. The {{today}} variable should use the date from that dropdown instead of the actual current date to allow for testing of different dates as needed.
