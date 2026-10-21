# Autotests demo

This is a tiny Playwright project inside `.ch/autotests/` of the Chioko fixture
repository. It exists so the **Autotests** section can be explored without pointing at a real
product.

The app detects the autotest project by this folder and runs discovery/execution with
`.ch/autotests/` as the working directory, so `package.json`,
`playwright.config.ts` and `node_modules` all live here.

## Install

From the fixture repository root:

```bash
cd .ch/autotests
npm install
```

The app resolves Playwright from **this project's** `node_modules` (it never installs anything
itself), so this step is required once after the fixture is generated.

## What is here

| Test | Case | Expected |
| --- | --- | --- |
| `seq-generator-permutation` | `RND-0002` (`b8d4e6017a`) | green |
| `seq-generator-min-validation` | `RND-0002` (`b8d4e6017a`) | **red on purpose** — the demo page rejects the valid minimum `1` |
| `dice-roller-faces` | `RND-0010` (`c217ab9043`) | green |

The red test is intentional: it gives you something to triage, bind, run and turn into a defect.

## Try it in Chioko

1. Open the **Autotests** section and tick **Trust this project**.
2. Click **Discover tests** — the three demo tests appear in the catalog.
3. Open a case (for example `RND-0002`), then select a discovered test and click
   **Bind to open case**. Enable the binding.
4. Open a run containing that case (e.g. `Регресс — случайность`), open the **Autotests** panel and
   click **Run linked**.
5. Results are shown separately from the manual result. Use **Apply to unrecorded** only if you
   want a row that has no manual result to take the automated status.
