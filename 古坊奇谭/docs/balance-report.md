# Estate Balance Baseline

Current results are in **New Stronger Current Enemy Growth** at the end of this report. All preceding measurements, formulas, survival targets and artifact references are historical and describe their explicitly fingerprinted versions.

Measured on 2026-10-04 with `scripts/estate-balance-sim.js` against current working-tree game values. Game SHA-256: `55a221b7bcaca8db97b5cb4bc14e7e5fd46c5536adbd7331c2d1c94d5120313d`. This fingerprint identifies the measured version even if tuning continues concurrently.

## Reproduction

```sh
node scripts/estate-balance-sim.js --days=30 --seeds=1,7,42,73193,99991 --style=balanced
node scripts/estate-balance-sim.js --days=30 --seeds=1,7,42,73193,99991 --style=economy
node scripts/estate-balance-sim.js --days=30 --seeds=1,7,42,73193,99991 --style=defense
node scripts/estate-balance-sim.js --days=30 --seeds=1,7,42,73193,99991 --style=balanced --baseline
```

The module exports `run(days=30, style='balanced', seed=73193, options={})` and `summary(result)`. Options: `towersPerGate` (2 or 3, default 2), `fortunes` (balanced only, default 1), `maxSeconds` (default days * 1200). CLI baseline emits full JSON to stdout, including daily history, action audit, selected plots and final buildings. Save artifacts through `apply_patch`; the simulator does not write files. The checked-in `estate-baseline.json` contains measured milestone rows, with explicit column names, rather than the larger action audit.

## Strategy And Measurement

- Starts through `G.createState(seed)` on a real 25 x 25 estate. Sets only the deterministic gameplay RNG seed; never assigns resources, levels or HP. Missions, kill rewards and dawn rewards remain enabled.
- Searches terrain for two seven-building groups: tea/inn/bank + farm/mill/wine + guild, and mulberry/weaver/tailor + quarry/kiln/trade + port. All intermediate links and final requirements are genuinely adjacent. Every operation passes `buildReason` or `upgradeReason` and the corresponding paid API.
- Reserves two land tower plots per cardinal gate, each within base tower range of that gate. Three per gate is available through the module option. Prefers plain plots off gate roads and distributes the first ring across all four directions.
- Balanced starts two economy producers, then alternates economy and defense priority, with periodic shrine unlocking, unified gate upgrades, and tower upgrades. Economy upgrades favor lower levels and the resource with the lower current production rate. Missing buildings can be rebuilt. Failed or unaffordable goals fall through to other legal actions rather than blocking the schedule.
- At most one successful build/upgrade per second; four `G.step(.25)` calls advance a second. Balanced can also cast at most one skill per second: repair below 60% building HP, thunder with at least five enemies, repel with at least three enemies within two tiles of a gate. Skills obey real cooldowns.
- Economy buys/upgrades only economy buildings and their necessary shrine unlocks. Defense buys/upgrades only towers, unified gates and shrine. Neither control casts skills or builds fortune. Balanced attempts one optional fortune only when normal tasks cannot act, on a plot outside all reserved plans.
- A completed day includes its entire night. Day-end resources include the actual dawn reward. Rates use the finished day's festival multiplier, not the next day's multiplier. Death and timeout rows are partial and marked `complete:false`.
- Production average excludes shrine and includes economy-category buildings. Highest level excludes shrine; shrine has its own field. Defense level averages buildings with attack damage, including any fortune defense; gate level is separate. Upgrade count counts a unified four-gate upgrade as one paid action.
- HP minima are sampled every 0.25 seconds across the day/night. Night deaths count removed buildings, including the shrine on defeat. Broken gates remain in state and are recorded separately as `gateBreaks`, including repeat breaks after repair. Night duration on defeat is elapsed duration, not a cleared-night time.

## Five-Seed Results

All five balanced runs clear nights 1-28. None clears night 30.

| Seed | First ordinary Lv9 | Shrine Lv15 | Defeat night | D20 coins | D20 materials | D25 minimum gate HP | D25 minimum shrine HP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 15 | 15 | 30 | 23,144,452 | 14,817,783 | 56.9% | 100% |
| 7 | 15 | 15 | 29 | 23,811,567 | 15,187,472 | 0% | 78.4% |
| 42 | 15 | 15 | 29 | 23,287,790 | 14,814,913 | 0% | 79.0% |
| 73193 | 14 | 14 | 29 | 29,236,767 | 18,896,399 | 0% | 74.1% |
| 99991 | 14 | 14 | 30 | 26,172,273 | 16,939,714 | 0% | 75.3% |

| Milestone | Coins/s across seeds | Materials/s across seeds | Economy mean level | Shrine level | Gate level | Towers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| D5 | 13.800-25.448 | 12.200-22.970 | 1.875-2.000 | 3 | 2 | 8 |
| D10 | 347.680-725.232 | 290.000-499.120 | 3.571-3.929 | 7-9 | 5 | 8 |
| D15 | 24,026.880-42,316.800 | 16,128.000-27,648.000 | 8.143-8.786 | 15 | 9 | 8 |
| D20 | 50,380.800 | 35,328.000 | 9.000 | 15 | 9 | 8 |
| D25 | 50,380.800 | 18,432.000-35,328.000 | 9.000 | 15 | 9 | 8 |

At D5 all shrines remain untouched; minimum gate HP is 18.6%-58.5%. At D10 two seeds show shrine damage, with the worst minimum 89.8%. At D15 all five nights have zero skill casts and zero building deaths, with gates and shrine untouched. All 14 planned economy types exist by D15. At D20 all production and tower levels are 9, and no upgrades happen that day. Late deaths produce rebuild/upgrade activity, so a later positive upgrade count is not new progression.

Both pure controls die on night 1 for all five seeds. Economy has 3-4 producers and no towers; defense has one tower and no producers. With initial materials of 120 and tower cost 70, defense cannot buy a second tower without material income. These controls expose the necessity of mixing economy and defense; they cannot establish late-game economic pacing on their own.

## Tuning Implications

Keep D1-D5 as the reference for opening cadence. The major acceleration is D10-D15: coin production grows roughly 58-69 times across these seeds in five days. The ordinary production multiplier doubles per level, chain bonuses scale with prerequisite level, and global economy aura bonuses scale with source level up to their cap. The current upgrade loop reaches full progression around the middle of the requested 30-day run.

Resource explosion persists after progression ends: D20 coin inventory is 23.1-29.2 million and final defeat inventories are 84.2-98.4 million. A full capped economy produces 50,380.8 coins/s and 35,328 materials/s on a normal day. Further enemy buffs alone would not resolve the missing resource sinks or compressed upgrade progression.

Enemy pressure already catches up after the D15 lull. Four of five seeds break a gate on D25, then every seed dies on D29-D30 despite capped gates/towers and pressure-driven skills. Enemy HP grows by 1.23 per day, damage by 1.12 per day, while ordinary defense stops growing at Lv9. Strengthening enemies should be evaluated jointly with the economy changes and the intended final survival target, rather than assuming these balanced runs currently survive indefinitely.

This is a fixed-capacity heuristic player, not an optimal defense search: eight reserved towers, one optional fortune, and one of each economy type. Layouts adapt to each map but do not relocate surviving buildings. Gates can still break while resources accumulate because the policy does not spend unlimited surplus on additional tower rings, barracks, or fortune spam. Results measure this explicit strategy. A three-tower-per-gate sensitivity run is available through the module; it is not included in the five-seed baseline above.

## Verification

Ran only the simulator, with no build and no existing test changes. Repeated 30-day balanced seed 73193 produced deeply identical results, including actions and layouts. Checked all construction/upgrade action intervals in that run and a five-day seed 42 run with three towers per gate: every interval is at least one second. Checked nonnegative end-state HP and daily resources. Ran all five seeds for both pure controls. Checked the baseline artifact against fresh simulator milestone values.

## Round Two Final Measurement

The sections above describe the preserved original baseline, not the current formulas. Round two game SHA-256 is `638034caa8615980a9dc5c9734a47e25beae06dca048bb291e3aaf488321cd0a`. Original `estate-baseline.json` remains unchanged. New `estate-tuned.json` stores actual outcomes for all 45 runs and individual D5/D10/D15/D20 samples for the original five seeds in the default and reinforcement groups. No-skills runs have no D5 samples because they die before that day.

New options: `useSkills` defaults to true; false changes only the casting condition. `reinforcementDay` defaults to null. With `towersPerGate:3, reinforcementDay:15`, layout generation still uses two towers per gate, then reserves four extra land plots outside the completed economy plan. Construction of those plots starts on D15. The default fortune plot is also excluded from reinforcement reservation so pre-D15 play remains identical. Towers continue to use the existing defense target and normal paid upgrades. Without a reinforcement day, `towersPerGate:3` retains the immediate three-tower opening.

```sh
node scripts/estate-balance-sim.js --days=35 --seeds=1,7,42,73193,99991 --style=balanced
node scripts/estate-balance-sim.js --days=35 --seeds=1,7,42,73193,99991 --style=balanced --useSkills=false
node scripts/estate-balance-sim.js --days=35 --seeds=1,7,42,73193,99991 --style=balanced --towersPerGate=3 --reinforcementDay=15
node scripts/estate-balance-sim.js --days=30 --seeds=3,11,23,57,101,2026,7777,12345,54321,314159 --style=balanced --towersPerGate=3 --reinforcementDay=15
```

Repeat the last seed list for the default and `--useSkills=false` groups. `--baseline` emits full histories and action audits for any of these commands. Effective options are included in both `run` and CLI summaries; CLI also accepts `--fortunes` and `--maxSeconds`. Milestone summaries now include D35.

### Opening, Economy And Progression

The following ranges use the same original five seeds only. Coins/materials are inventories after the corresponding night and dawn rewards; rates use the finished day's multiplier. All rows below are complete nights. Seed-level actual values are in the two artifacts.

| Version / policy | Day | Coins/s | Materials/s | Coins inventory | Materials inventory | Mean production level | Highest ordinary level | Shrine level | Gate level |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Original baseline | 5 | 13.800-25.448 | 12.200-22.970 | 314-477 | 74-330 | 1.875-2.000 | 3 | 3 | 2 |
| Round two default | 5 | 13.800-25.448 | 12.200-22.970 | 314-477 | 74-330 | 1.875-2.000 | 3 | 3 | 2 |
| Original baseline | 10 | 347.680-725.232 | 290.000-499.120 | 952-3,178 | 216-3,012 | 3.571-3.929 | 5-6 | 7-9 | 5 |
| Round two default | 10 | 126.164-214.372 | 118.518-181.022 | 514-2,270 | 203-2,466 | 3.250-3.750 | 5 | 7 | 4-5 |
| Original baseline | 15 | 24,026.880-42,316.800 | 16,128.000-27,648.000 | 41,399-1,481,361 | 21,866-297,135 | 8.143-8.786 | 9 | 15 | 9 |
| Round two default | 15 | 604.399-1,104.811 | 578.430-839.047 | 2,217-23,317 | 1,646-16,343 | 4.857-5.692 | 6-7 | 10-11 | 6-7 |
| Round two D15 reinforcement | 15 | 433.810-916.579 | 527.869-851.469 | 2,805-14,453 | 4,206-22,788 | 4.286-5.500 | 6-7 | 10-11 | 6-7 |
| Original baseline | 20 | 50,380.800 | 35,328.000 | 23,144,452-29,236,767 | 14,814,913-18,896,399 | 9.000 | 9 | 15 | 9 |
| Round two default | 20 | 1,770.065-2,382.970 | 864.278-2,379.617 | 3,581-65,604 | 27,254-119,850 | 6.357-7.143 | 8 | 13 | 8 |
| Round two D15 reinforcement | 20 | 1,676.577-2,158.312 | 865.831-1,738.826 | 11,760-56,868 | 1,432-69,926 | 6.071-6.857 | 7-8 | 12-13 | 7-8 |

Reinforcement D5 and D10 values are identical to round two default. D5 default history also exactly matches the original baseline for all recorded milestone columns. Thus the measured first-five-day cadence is preserved, while D20 default coin production is about 21-28 times lower and progression remains unfinished.

Dates below are first ordinary Lv9 / first shrine Lv15. A dash means neither level was reached before defeat. These first-attainment dates can remain set even when a building is subsequently destroyed.

| Seed | Original dates | Round two default dates | Reinforcement dates | Original defeat night | Default defeat night | Reinforcement defeat night | No-skills defeat night |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| 1 | 15 / 15 | 26 / 26 | 27 / 27 | 30 | 31 | 34 | 1 |
| 7 | 15 / 15 | 25 / 25 | 26 / 26 | 29 | 29 | 32 | 1 |
| 42 | 15 / 15 | 25 / 25 | 28 / 28 | 29 | 30 | 32 | 2 |
| 73193 | 14 / 14 | 24 / 24 | 25 / 25 | 29 | 30 | 32 | 1 |
| 99991 | 14 / 14 | 26 / 26 | - | 30 | 30 | 27 | 1 |

All original five seeds were requested for 35 days; none clears night 35. Default clears night 30 in 1/5, reinforcement in 4/5. The no-skills version keeps mixed economy/defense behavior and all 15 tested seeds die on night 1 or 2, with exactly zero skill casts. It does not provide a late-game comparison.

### Extra Ten Seeds

`clear` means night 30 completed, represented by `over:false, day:31`; no timeouts occurred. Every other entry is the actual defeat night. Dates are ordinary Lv9 / shrine Lv15.

| Seed | Default result | Default dates | Reinforcement result | Reinforcement dates | No-skills defeat night |
| --- | --- | --- | --- | --- | ---: |
| 3 | clear | 25 / 25 | clear | 27 / 27 | 1 |
| 11 | D26 | - | D30 | - | 1 |
| 23 | clear | 25 / 25 | clear | 27 / 27 | 1 |
| 57 | D20 | - | D27 | - | 1 |
| 101 | clear | 26 / 26 | clear | 27 / 27 | 1 |
| 2026 | D24 | - | D29 | - | 2 |
| 7777 | D29 | 26 / 26 | D27 | - | 1 |
| 12345 | D30 | 26 / 26 | clear | 28 / 28 | 2 |
| 54321 | D26 | - | D27 | - | 1 |
| 314159 | D26 | - | clear | 26 / 26 | 1 |

Extra-seed night-30 clears improve from 3/10 to 5/10. Across all 15 seeds, night-30 clears improve from 4/15 to 9/15. Supplementary tower cost delays progression and can hurt survival: 99991 loses three nights and 7777 loses two nights. Reinforcement is a useful sensitivity policy but is not uniformly better.

### Pressure Changes

Ranges below use original five seeds. HP is the sampled minimum fraction during the entire day/night. Removed buildings include shrine deaths only on defeat; these are complete milestone nights.

| Version / policy | Day | Minimum gate HP | Minimum shrine HP | Buildings lost per night | Night seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original | 5 | 18.6%-58.5% | 100% | 0 | 32.25-34.25 |
| Round two default | 5 | 18.6%-58.5% | 100% | 0 | 32.25-34.25 |
| Original | 10 | 21.4%-58.5% | 89.8%-100% | 0 | 48.50-54.75 |
| Round two default | 10 | 0%-57.9% | 84.7%-100% | 0-3 | 53.00-62.75 |
| Original | 15 | 100% | 100% | 0 | 41.75-43.50 |
| Round two default | 15 | 0% | 64.9%-100% | 0-6 | 64.75-94.00 |
| Round two reinforcement | 15 | 0%-86.5% | 92.7%-100% | 0-6 | 50.50-69.50 |
| Original | 20 | 56.0%-58.4% | 100% | 0 | 49.50-49.75 |
| Round two default | 20 | 0% | 69.4%-96.3% | 0-3 | 58.25-76.50 |
| Round two reinforcement | 20 | 0% | 50.5%-98.5% | 0-3 | 52.75-81.75 |

Default first gate breaks occur on D6-D10 in the original five seeds, and first shrine damage on D9-D12. Reinforcement cannot change those pre-D15 events. The old D15 zero-pressure lull is gone. The default group casts 189-220 skills before defeat across the original five seeds. Final default coin inventories are 57,163-471,837 rather than the original 84.2-98.4 million; material inventories can still reach 1.71 million. Rebuilds and resource imbalance contribute to these totals.

### Current Formulas

Let L be building level, D be day, and late = max(0, D - 14). These formulas describe the measured game source, not changes made by this simulator.

- Ordinary income multiplier: `2^min(2,L-1) * 1.65^max(0,L-3)`. Shrine income multiplier: `2^min(2,L-1) * (1 + 0.25*max(0,L-3))`.
- Economy aura and prerequisite contribution multiplier: `2^min(2,L-1) * (1 + 0.2*max(0,L-3))`. Total income bonus is still capped at +200%; festival days multiply income by 1.25. Each building's base income multiplies its income factor and `1 + capped bonus`.
- Upgrade cost per resource: `ceil(base * 1.8 * growth^(L-1) * lateCostFactor)`. Shrine growth is 1.65 and late cost factor is `1.08^max(0,L-7)`. Other income buildings use growth 2.15 and `1.12^max(0,L-4)`; buildings without income have late cost factor 1.
- Defense damage remains `base damage * 2^(L-1) * defenseBoost`, with interval from its definition and range `base range + 0.35*(L-1)`. HP remains `round(base HP * 1.55^(L-1))`.
- Enemy HP multiplier: `1.23^min(13,D-1) * 1.19^min(7,late) * 1.10^max(0,late-7) * (1 + 0.08*late)`. Final boss HP multiplier is additionally 4.5.
- Enemy damage multiplier: `1.12^min(20,D-1) * 1.06^max(0,D-21) * (1 + 0.04*late)`. Final boss damage multiplier is additionally 2. Enemy speed factor remains `min(1.22,1.012^(D-1))`.
- Wave count remains `min(120,7 + 3*D + 2*floor(D/3) + (bossNight ? 12 : 0))`; boss nights occur every seventh day.

### Suggestions And Limits

The economy goal is substantially met in this sample: the opening is preserved and ordinary Lv9 is delayed by about ten days. Additional broad enemy buffs would now increase an already visible D9-D15 burden and should be evaluated against a stated target survival rate. If the desired game permits early nights without skill use, evaluate early defense placement/funding or enemy pressure specifically; the current unmodified heuristic opening demonstrably relies on skills, but this is not proof that every possible opening requires them.

Evaluate reinforcement as a tradeoff rather than an automatic upgrade: four extra towers add recurring upgrade expenses and consume actions needed for shrine/economy progression. Consider using these actual paired outcomes to choose an intended D30 survival target before adjusting more numbers. Late resource imbalance warrants attention separately: several failures retain many materials but little coin liquidity.

All 45 runs checked minimum one-second intervals between successful builds/upgrades, nonnegative sampled resources, and a single game fingerprint. All 15 reinforcement runs have deeply identical economy layouts, pre-D15 actions and pre-D15 daily histories to their default counterparts. Reinforcement plots remain unbuilt before D15; no-skills runs emit no skill actions. The saved artifact is compared to fresh results. Deterministic repeat checks cover the new options as well.

Limitations: 15 paired maps are a sample, not a distribution-wide guarantee. The policy builds one of each economy type, uses one optional fortune, does not relocate survivors, and reserves tower positions by distance rather than optimizing kill coverage. Actual tower count can be 9 or 13 if fortune rolls an extra tower. Reinforcement excludes the default first fortune plot; with more than one fortune, pre-D15 identity is not guaranteed. Skills are a separate action stream, allowed alongside the single construction/upgrade action each second. No-skills removes that stream while preserving the same economic/defense policy, rather than reoptimizing the opening. Compact artifacts contain milestone samples and outcomes, not complete daily audits; full audits remain available through `--baseline`. No game, app, test, or build files were edited or executed for this task.

## Latest Industry Tier Measurement

Measured on 2026-10-04 against game SHA-256 `58c66a27acef89d7ff02de694310f3d8e390132d6f7c6d79ed4be69beafe8b1b`. This section supersedes the round-two current-value description for industry definitions only. The preceding sections and both historical artifacts are preserved. `estate-tier-tuned.json` contains the new 30 outcomes, five-seed milestone samples for both policies, actual `G.DEFS` values, historical round-two outcomes and artifact fingerprints. Old results are read from `estate-tuned.json`, not rerun against new formulas.

### Definitions And Payback

Starter and middle definitions remain unchanged from round two. Endpoint base income is now 40 for bank/trade and 24 for wine/tailor; guild is 240 and port is 300. Actual construction costs below are obtained from `G.DEFS`, including rounding, rather than estimated from income ratios.

| Type | Base income/s | Coins cost | Materials cost | Income scale from round two |
| --- | ---: | ---: | ---: | ---: |
| bank | 40 coins | 2,867 | 5,000 | 40/9 |
| wine | 24 coins | 1,720 | 3,000 | 4 |
| tailor | 24 materials | 3,680 | 1,200 | 4 |
| trade | 40 materials | 6,134 | 2,000 | 40/9 |
| guild | 240 coins | 44,572 | 66,858 | 240/14 |
| port | 300 materials | 70,500 | 37,500 | 15 |

Construction and upgrade bases scale with the increased income; the existing level multiplier and late-upgrade premium still apply. Thus at a fixed level with the same prerequisites, global bonuses and festival multiplier, cost divided by own output remains approximately consistent, subject to integer ceilings. For example, guild's original 2,600/3,900 costs scale by 240/14, and port's 4,700/2,500 costs scale by 15. High-chain endpoint costs are calculated from the underlying chain base, so scaling an already rounded old cost can differ by one unit. This is an own-output payback proxy, not a promise that a two-resource purchase funds itself: coin producers still need material producers and vice versa. More expensive prerequisite construction and rebuilds can delay the whole chain even when the per-building proxy is preserved.

### Reproduction And Baseline

Both policies request 35 days for all fifteen maps, using balanced play, skills enabled, one optional fortune, and the simulator's default 42,000-second timeout. The reinforcement policy reserves one additional tower per gate and starts constructing it on D15.

```sh
node scripts/estate-balance-sim.js --days=35 --seeds=1,7,42,73193,99991,3,11,23,57,101,2026,7777,12345,54321,314159 --style=balanced
node scripts/estate-balance-sim.js --days=35 --seeds=1,7,42,73193,99991,3,11,23,57,101,2026,7777,12345,54321,314159 --style=balanced --towersPerGate=3 --reinforcementDay=15
node --test tests/balance.test.js
```

The saved round-two default D20 rates were 1,770.065-2,382.970 coins/s and 864.278-2,379.617 materials/s; inventories were 3,581-65,604 coins and 27,254-119,850 materials. Round-two reinforcement D20 rates were 1,676.577-2,158.312 and 865.831-1,738.826; inventories were 11,760-56,868 and 1,432-69,926. These are historical five-seed ranges, retained for comparison. Round-two first ordinary Lv9 dates for the five primary seeds were default 26/25/25/24/26 and reinforcement 27/26/28/25/unreached. Round-two D30 clear counts were default 4/15 and reinforcement 9/15. The old extra ten runs stopped after D30, so their eventual defeat nights and D35 survival cannot be inferred.

### Five-Seed Rates And Stocks

Each cell below is `coins / materials`. Rates are per second; stocks are after the completed night and dawn reward. All listed samples are complete. D5 is identical for the two current policies and matches every saved round-two milestone column for these five seeds.

| Seed | D5 rates | D5 stocks |
| --- | ---: | ---: |
| 1 | 19.800 / 22.400 | 337 / 330 |
| 7 | 19.800 / 22.400 | 314 / 296 |
| 42 | 13.800 / 12.200 | 436 / 157 |
| 73193 | 25.448 / 22.970 | 477 / 74 |
| 99991 | 13.800 / 12.200 | 345 / 81 |

| Policy | Seed | D15 rates | D15 stocks | D20 rates | D20 stocks | First ordinary Lv9 | Defeat night |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Default | 1 | 816.228 / 709.492 | 12,687 / 16,851 | 2,353.186 / 2,028.579 | 10,312 / 5,479 | 24 | 31 |
| Default | 7 | 863.167 / 493.631 | 1,892 / 4,816 | 2,481.050 / 1,585.759 | 52,322 / 33,440 | 24 | 29 |
| Default | 42 | 595.812 / 578.292 | 2,675 / 885 | 2,353.186 / 2,155.983 | 6,311 / 6,703 | 24 | 30 |
| Default | 73193 | 879.843 / 535.817 | 11,547 / 24,877 | 3,352.610 / 2,720.467 | 70,035 / 99,943 | 22 | 30 |
| Default | 99991 | 816.228 / 709.492 | 4,756 / 10,285 | 2,353.186 / 1,393.330 | 17,524 / 68,283 | 24 | 30 |
| D15 reinforcement | 1 | 713.892 / 513.849 | 15,260 / 7,139 | 1,950.155 / 1,400.520 | 8,437 / 54,429 | 25 | 34 |
| D15 reinforcement | 7 | 816.228 / 447.092 | 18,406 / 13,477 | 2,273.087 / 1,503.189 | 66,422 / 29,774 | 25 | 32 |
| D15 reinforcement | 42 | 503.572 / 513.849 | 5,193 / 1,412 | 1,950.155 / 1,400.520 | 43,592 / 36,947 | 25 | 32 |
| D15 reinforcement | 73193 | 879.843 / 739.444 | 5,675 / 9,576 | 2,522.579 / 2,246.518 | 44,092 / 95,497 | 23 | 32 |
| D15 reinforcement | 99991 | 713.892 / 513.849 | 16,368 / 6,026 | 2,273.507 / 1,319.345 | 7,426 / 3,198 | 26 | 32 |

The first Lv9 includes defense buildings and is not a date for a fully capped economy. Default first attainment moves 1-2 days earlier than round two. At D20 default mean production levels are 5.643-6.143, versus round two's 6.357-7.143, despite greater income. Higher tier costs and uneven levels make income and mean level move differently.

### Fifteen-Map Survival

Clearing night 30 requires a complete D30 history row. A defeat on night 30 is a failure, even if most of that night was survived. All current runs ended in defeat before D35, with no timeouts.

| Policy / version | Primary five D30 clears | Extra ten D30 clears | All fifteen D30 clears | D30 clear rate | Current D35 clears |
| --- | ---: | ---: | ---: | ---: | ---: |
| Round two default | 1/5 | 3/10 | 4/15 | 26.7% | Not measured for all fifteen |
| Current default | 1/5 | 3/10 | 4/15 | 26.7% | 0/15 |
| Round two reinforcement | 4/5 | 5/10 | 9/15 | 60.0% | Not measured for all fifteen |
| Current reinforcement | 5/5 | 9/10 | 14/15 | 93.3% | 0/15 |

| Extra seed | Default first Lv9 | Default defeat night | Reinforcement first Lv9 | Reinforcement defeat night |
| --- | ---: | ---: | ---: | ---: |
| 3 | 25 | 31 | 26 | 31 |
| 11 | Unreached | 26 | Unreached | 26 |
| 23 | 23 | 33 | 25 | 33 |
| 57 | 24 | 30 | 26 | 32 |
| 101 | 25 | 31 | 26 | 32 |
| 2026 | 24 | 30 | 25 | 32 |
| 7777 | 24 | 29 | 25 | 33 |
| 12345 | 24 | 30 | 27 | 32 |
| 54321 | 25 | 30 | 27 | 33 |
| 314159 | 24 | 30 | 26 | 33 |

Current reinforcement improves defeat night on twelve maps and ties on three (3, 11, 23); it delays first ordinary Lv9 by 1-3 days on every map that reaches it. Relative to round-two reinforcement, seed 11 instead declines from defeat night 30 to 26. The larger sample clear rate does not mean every map benefits from the tier change.

### Tier Guarantee And Tradeoff

The existing tests in `tests/balance.test.js:30` and `:53` passed without adding duplicate tests or production logic. They evaluate actual `G.income` at each Lv1-Lv9 on ordinary and festival days, with uncapped and capped equal global bonuses. Sparse endpoints retain their prerequisite chain and beat maximally supplied middles by at least 2.5 times (`endMin / midMax >= 2.5`, equivalently `midMax / endMin <= 0.4`). Sparse ultimates with one of each required endpoint beat fully supplied same-resource 40-income endpoints by at least 2 times (`ultimate / endMax >= 2`). Farm scenes also include the well contribution. These are same-level guarantees under the tested supply and equal-global-bonus conditions; different building levels do not have that guarantee.

The stronger hierarchy gives endpoints and ultimates a larger role as the main income sources. Fresh D20 snapshots evaluated through actual `G.income` show endpoints plus ultimates contributing 67.7%-76.1% of combined economy output in the five default runs and 69.8%-73.5% with reinforcement. Endpoints alone contribute 42.6%-56.6% / 45.3%-59.0%; ultimates contribute 13.9%-28.9% / 15.0%-27.0%. These shares exclude shrine and add coin/material rates without assigning exchange values; they do not imply ultimates individually dominate while still at lower levels.

The tradeoff is stronger eventual output with substantially larger purchase, upgrade and replacement payments. D15 current default coin rates are lower than round two in all five primary maps, while D20 rates are higher in all five; extra income is not immediate. D20 stocks remain uneven, and eventual defeat can still leave substantial surplus: current default final stocks across all fifteen are 28,607-1,114,827 coins and 55,410-1,621,311 materials; reinforcement reaches 13,611-1,554,020 coins and 12,301-2,196,219 materials. The heuristic has finite defense capacity, so surplus does not imply survival. The enemy curves remain those documented in round two; this tier measurement introduces no enemy changes.

Verification: all 30 runs checked nonnegative sampled resources, no timeouts and at least one second between successful construction/upgrade actions. All fifteen paired policies have identical economy layouts, pre-D15 actions and pre-D15 histories. All saved round-two D5 milestone columns were checked against fresh five-day runs. The existing balance suite passed all 12 tests, including tier bounds, costs, progression, defense and enemy curves. Only this report was appended and `estate-tier-tuned.json` was added; scripts, core, tests and historical artifacts were not edited. Results retain the existing heuristic and fifteen-map sample limitations.

## Opening Smoothing And Direction-Aware Simulation

Measured on 2026-10-04 against working-tree game SHA-256 `b868a1a1dbbca58febeba4785c578179fabe69b9e31859c8197588b2a875828f`. This section supersedes earlier current-value and current-policy descriptions; historical measurements above remain historical. Only `scripts/estate-balance-sim.js` and this report were edited for this measurement. No production changes, tests, build, or new artifact files were made or run.

### Actual Core Values And Opening Diagnosis

The existing core now starts new 25-tile estates with 220 materials; legacy creation still starts with 120. For D1-D9, wave count multiplies the former count by `0.5 + 0.5*(D-1)/9`, rounded upward; enemy HP multiplies its former curve by `0.45 + 0.55*(D-1)/9`, and enemy damage by `0.3 + 0.7*(D-1)/9`. These factors reach 1 on D10 and stay at 1 afterward. Ghosts first appear on D4, foxes on D5. D1 therefore has five bandits. The simulator reads these actual formulas and uses normal paid APIs, income, missions and rewards; it does not assign resources, HP or levels.

Before the simulator edit, a fresh no-skills seed 7 run still lost night 1 at second 220, with zero kills and 140 seconds of night combat. Its west gate is `(5,12)`. The opening bought tea/mulberry/quarry/farm at seconds 0/1/2/3, then a fortune at 21 that rolled rock. It built the north tower `(11,6)` at second 49, east `(18,11)` at 77, south `(11,18)` at 105 and west `(6,11)` only at 133. Day lasts 72 seconds, dusk 8: the west warning was already available when the east tower was purchased. Thus the first two available towers defended the wrong directions. Seed 7's west plots `(6,11)` and `(7,13)` have outside-tile distances 2.236 and 3.162, so the seed 7 failure was delayed defense, not an out-of-range west layout.

There was also an independent range defect on river maps. Seed 2026's west gate is `(5,12)`; the old selector preferred `(8,11)` and `(8,13)`, each 3.162 from the gate but 4.123 from the outside enemy tile `(4,12)`, beyond the Lv1 tower range of 4. Actual attacks use Euclidean enemy distance, not distance to the gate. The new selector requires both gate distance and outside-tile distance to be within the actual base range, for initial and reinforcement towers. It chooses `(7,12)` and `(8,12)` on that map, at outside distances 3 and 4. Road plots are allowed by the real build API and now win over unreachable off-road plots.

Boundary limitation: core enemies stop to attack within 1.05 tiles of a building and can stop slightly farther out than the exact one-tile grid position. Seed 2026 has only two legal land plots covering the outside grid tile at base range; `(8,12)` is exactly on the range-4 boundary and can still miss a stopped enemy until Lv2 extends range to 4.35. The simulator does not change combat geometry or pretend that this tower already covers every fractional stopping position. Other maps or three-tower requests with insufficient qualifying plots still fail explicitly rather than reserving unreachable towers.

### Policy And Reproduction

Balanced day actions keep the existing economy/defense/shrine schedule. At dusk and night, defense gets first action priority. On ordinary nights, missing towers at the announced `s.direction` come first, followed by upgrades of those towers to the existing day-based target, before other gates' towers and unified gate upgrades. On every seventh night all four directions receive alert priority, matching actual boss spawning. Remaining tasks fall through normally when a purchase is unavailable. Each successful construction/upgrade still consumes its single action slot per second; skills remain a separate stream and obey real cooldowns. There is no future-direction lookup during daytime.

Action audits now include phase, announced direction and post-purchase resources; upgrades also include coordinates. `fullLevel9Day` records first simultaneous Lv9 of all fourteen planned economy buildings, all planned towers and unified gates. It excludes optional fortune rolls; shrine Lv15 is reported separately. It is stricter than `firstLevel9Day`, which records any ordinary building reaching Lv9 and can remain set after that building is destroyed.

```sh
node scripts/estate-balance-sim.js --days=20 --seeds=1,7,42,73193,99991 --style=balanced --useSkills=false
node scripts/estate-balance-sim.js --days=20 --seeds=1,7,42,73193,99991 --style=balanced
node scripts/estate-balance-sim.js --days=30 --seeds=1,7,42,73193,99991,3,11,23,57,101,2026,7777,12345,54321,314159 --style=balanced
```

Use `--baseline` or exported `run` for full daily histories and action audits. All measurements below use two towers per gate, one optional fortune and no reinforcement. A completed night, rather than arrival at that day, counts as survival.

### Five Seeds Without Skills, Requested 20 Nights

All five clear nights 1-3 without any skill casts, gate breaks, building deaths or shrine damage during those three nights. None survives night 20. The smoothing addresses the first-three-night target in this sample; D4-D9 still requires additional defense or skills under this heuristic.

| Seed | D1 minimum gate HP | D2 minimum gate HP | D3 minimum gate HP | Nights completed | Defeat night | First gate break | First shrine damage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 92.2% | 92.2% | 52.0% | 8 | 9 | 4 | 5 |
| 7 | 92.2% | 92.2% | 64.6% | 4 | 5 | 5 | 5 |
| 42 | 100% | 100% | 89.7% | 5 | 6 | 4 | 4 |
| 73193 | 100% | 92.4% | 70.3% | 7 | 8 | 5 | 5 |
| 99991 | 99.4% | 87.3% | 66.9% | 3 | 4 | 4 | 4 |

With the revised seed 7 policy, the first west tower is built at second 77 during dusk, the second at 96 during night. Night 1 clears at second 97.25 with five kills, 17.25 seconds of combat and 92.2% minimum gate HP. This is a normal paid opening with zero skill actions.

### Five Seeds With Skills, Actual Night 20 Samples

All five complete D5, D10 and D15. Only three complete D20; seed 7 and 99991 lose that night. The partial rows below are explicitly marked and must not be counted as night-20 survival. Rates are coins/materials per second; stocks include dawn rewards only on complete rows.

| Seed | D20 complete | D20 rates | D20 stocks | Mean economy Lv | Highest ordinary Lv | Gate / defense Lv | Minimum gate / shrine HP | Buildings lost |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | yes | 1,781.161 / 2,051.005 | 10,122 / 30,420 | 4.923 | 7 | 7 / 7 | 0% / 100% | 4 |
| 7 | no, defeat | 1,944.695 / 1,400.520 | 310 / 13,432 | 5.769 | 7 | 7 / 7 | 0% / 0% | 1 |
| 42 | yes | 1,405.320 / 1,223.429 | 20,208 / 33,521 | 6.083 | 7 | 7 / 7 | 0% / 23.3% | 1 |
| 73193 | yes | 2,738.577 / 2,954.084 | 22,702 / 67,592 | 5.929 | 8 | 8 / 8 | 0% / 92.3% | 1 |
| 99991 | no, defeat | 1,743.255 / 2,127.669 | 27,335 / 47,802 | 5.357 | 7 | 7 / 7 | 0% / 0% | 4 |

Across the five complete D5 rows, rates are 10.400-10.694 coins/s and 9.600-9.870 materials/s, mean economy level is 1.667, and gate minimum HP is 57.8%-88.6% with untouched shrines and no losses. Complete D10 ranges are 81.504-136.468 / 72.410-96.932, mean economy level 3.222-3.889, and shrine minimum HP 66.2%-100%. Complete D15 ranges are 439.129-831.842 / 435.129-723.102, mean economy level 4.500-5.083, shrine minimum HP 9.9%-100%, and 0-3 buildings lost. The previous industry's D5 values are not preserved: shorter early waves reduce time earning income and this policy redirects spending to defense. These results do not isolate the causal effect of core smoothing from layout and policy changes.

### Fifteen Seeds With Skills, Requested 30 Nights

| Seed | Result | First ordinary Lv9 | Shrine Lv15 | Full planned Lv9 |
| --- | --- | ---: | ---: | --- |
| 1 | defeat D29 | 25 | 25 | unreached |
| 7 | defeat D20 | unreached | unreached | unreached |
| 42 | defeat D22 | unreached | unreached | unreached |
| 73193 | defeat D29 | 22 | 22 | unreached |
| 99991 | defeat D20 | unreached | unreached | unreached |
| 3 | defeat D20 | unreached | unreached | unreached |
| 11 | defeat D25 | unreached | unreached | unreached |
| 23 | defeat D20 | unreached | unreached | unreached |
| 57 | clear D30 | 25 | 24 | unreached |
| 101 | clear D30 | 25 | 25 | unreached |
| 2026 | clear D30 | 23 | 23 | unreached |
| 7777 | defeat D29 | 24 | 24 | unreached |
| 12345 | clear D30 | 24 | 24 | unreached |
| 54321 | defeat D16 | unreached | unreached | unreached |
| 314159 | clear D30 | 25 | 25 | unreached |

Night-30 clears are 0/5 primary seeds, 5/10 extra seeds, 5/15 overall (33.3%). There are no timeouts. Eight maps attain first ordinary Lv9 on D22-D25; seven lose before attaining it. No map attains simultaneous full planned Lv9 by defeat or D30. Thus the `>= D20` progression floor is preserved, including the stricter full-layout definition, with no measured premature cap. Failure to reach full Lv9 does not establish an eventual completion date for censored or defeated runs. Historical default industry's first-Lv9 range was D22-D25 and D30 clears were 4/15; the new total is 5/15, but primary-map survival declines and multiple changes prevent attributing that difference to smoothing alone.

Verification used simulator runs and inline assertions only: all fifteen layouts cover their assigned gate and outside grid tile at base range, paid action intervals are at least one second, sampled resources are nonnegative, all runs share the fingerprint above, and no-skills runs contain zero skill actions. Repeating the full 20-night no-skills seed 7 run is deeply identical, including actions and layout. Separate five-day immediate three-tower seed 42 and sixteen-day delayed-reinforcement seed 7 simulations complete successfully; reinforcement is not built before D15. No production tests or build were executed. The fifteen-map sample, fixed defense capacity, fractional stopping boundary and survival censoring remain limits on interpretation.

## Faster Late Enemy Growth

Measured on 2026-10-04 against working-tree `js/game.js` SHA-256 `baf70ed5c5e5ce74755a5d773775b5fa4cb02ae6a1f69bc4994b02ecc4af6622`. This section supersedes all earlier current-value descriptions and survival expectations. Earlier tables and JSON artifacts remain historical; none was updated or treated as a measurement of this growth curve.

### Growth And Reproduction

Let `D` be the day, `late = max(0,D-14)` and `opening = min(1,(D-1)/9)`. Actual non-boss enemy stats are base stats multiplied by:

- HP: `(0.45 + 0.55*opening) * 1.23^min(13,D-1) * 1.24^min(7,late) * 1.18^max(0,late-7) * (1 + 0.08*late)`.
- Damage: `(0.3 + 0.7*opening) * 1.12^min(13,D-1) * 1.15^min(7,late) * 1.12^max(0,late-7) * (1 + 0.04*late)`.

Boss multipliers remain 4.5 for HP and 2 for damage. HP's later exponential bases increase from 1.19/1.10 to 1.24/1.18. Damage previously used `1.12^min(20,D-1) * 1.06^max(0,D-21)`; it now uses the three segments above. The linear late factors, opening factors and first fourteen days are unchanged. Tests check the exact non-boss curves for D1-D31, explicit D15/D21/D30 checkpoints, and the transition ratios after D21. Wave-count smoothing and ghost/fox opening checks remain covered.

Run from the project directory:

```sh
node scripts/estate-balance-sim.js --days=30 --seeds=1,7,42,73193,99991 --style=balanced
node scripts/estate-balance-sim.js --days=3 --seeds=1,7,42,73193,99991 --style=balanced --useSkills=false
node scripts/estate-balance-sim.js --days=30 --seeds=1 --style=balanced --towersPerGate=3 --reinforcementDay=15
npm test
```

Default balanced runs use skills, two towers per gate, one optional fortune, no reinforcement and a 36,000-second timeout. Add `--baseline` for complete histories and paid action audits. The summary below was obtained from fresh simulator runs against the fingerprint above, with no production or simulator edits.

### Five-Seed Summary

Completed nights count only `complete:true` history rows. A defeat on D15 does not clear night 15. Unreached progression dates are not estimates of eventual attainment.

| Seed | Completed nights | Defeat night | Elapsed seconds | First ordinary Lv9 | Shrine Lv15 | Full planned Lv9 |
| --- | ---: | ---: | ---: | --- | --- | --- |
| 1 | 22 | 23 | 2947.50 | unreached | unreached | unreached |
| 7 | 14 | 15 | 1842.00 | unreached | unreached | unreached |
| 42 | 18 | 19 | 2527.00 | unreached | unreached | unreached |
| 73193 | 25 | 26 | 3647.75 | 22 | 22 | unreached |
| 99991 | 19 | 20 | 2704.25 | unreached | unreached | unreached |

All five runs end in defeat, with no timeouts and 0/5 D30 clears. Four clear D15; seed 7 defeats on D15. Two clear D20 (1 and 73193); seed 99991's D20 row is partial. This explicitly authorized harder curve replaces the former three-seed D20 survival requirement. The retained regression baseline is five-seed survival through D14 and four-seed survival through D15, with pressure and delayed progression checks.

| Seed | D15 complete | D15 coins/s | D15 materials/s | D15 mean production Lv | D15 minimum gate HP | D15 minimum shrine HP | D15 buildings lost |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | yes | 517.849 | 435.129 | 4.583 | 97.8% | 100% | 0 |
| 7 | no, defeat | 435.129 | 435.129 | 4.500 | 0% | 0% | 3 |
| 42 | yes | 399.769 | 435.129 | 4.417 | 0% | 37.7% | 6 |
| 73193 | yes | 831.842 | 723.102 | 5.083 | 0% | 33.2% | 0 |
| 99991 | yes | 582.692 | 578.292 | 4.833 | 0% | 55.8% | 4 |

Middle-game pressure remains observable across every full run: gates take damage and break, the shrine takes damage, and all three skills are used. Pressure varies by direction and map; seed 1's light D15 does not imply a pressure-free middle game. The only observed first Lv9 is D22, and no seed reaches full planned Lv9.

### Opening And Reinforcement Checks

All five seeds freshly clear nights 1-3 without skills, shrine damage, building losses or gate breaks. Their per-night minimum gate HP fractions are identical to the preceding opening measurement: seed 1 `0.922/0.922/0.520`, seed 7 `0.922/0.922/0.646`, seed 42 `1/1/0.897`, seed 73193 `1/0.924/0.703`, seed 99991 `0.994/0.873/0.669`. Every skill counter is zero and no skill action is emitted.

To isolate this curve change, an inline Node comparison loaded the current game source into a separate `Module` in memory, restoring only the old HP bases 1.19/1.10 and old damage expression `1.12^min(20,D-1) * 1.06^max(0,D-21)`. It loaded the same unmodified simulator against that module and ran paired 30-night balanced simulations. All five seeds' D1-D14 histories and pre-D15 action audits were deeply equal to current runs. The restored-curve defeat nights were 29/20/22/29/20; new defeat nights are 23/15/19/26/20. No source file was written for this comparison. This checks early identity while holding the current simulator policy fixed, rather than inferring it from historical tables.

The fresh seed 1 reinforcement run clears 24 nights and defeats on D25 at second 3270.25, versus 22 nights and defeat D23 at second 2947.50 by default. All four additional towers are paid builds on D15 at seconds 1707/1708/1709/1710. Pre-D15 histories and action audits are deeply identical between these two policies. The test retains the measured longer survival and legal delayed construction checks; the historical requirement that reinforcement clears D30 is removed. Only seed 1 reinforcement was measured here, so this result does not establish a five-seed reinforcement benefit or a universal survival target.

Verification: `npm test` passed all 80 tests with zero failures, including exact enemy curves, five-seed three-night no-skills opening, the revised middle-game baseline and seed 1 reinforcement comparison. Only `tests/game.test.js`, `tests/balance.test.js` and this report were edited for this update. No build was run and no historical artifact was changed. Outcomes retain the simulator's fixed-policy and small-sample limitations.

## New Stronger Current Enemy Growth

Measured on 2026-10-04 against working-tree `js/game.js` SHA-256 `5196a3ed5a3da25c2393404a77e9c3427ca61d43814208cbaba630559799803f`. This section supersedes earlier current curves and survival expectations. Production source already contained the stronger curve and was not edited; concurrent working-tree changes were preserved. Historical measurements and artifacts above remain historical.

With `late = max(0,D-14)` and `opening = min(1,(D-1)/9)`, non-boss stats use:

- HP: `base HP * (0.45 + 0.55*opening) * 1.23^min(13,D-1) * 1.28^min(7,late) * 1.22^max(0,late-7) * (1 + 0.08*late)`.
- Damage: `base damage * (0.3 + 0.7*opening) * 1.12^min(13,D-1) * 1.18^min(7,late) * 1.15^max(0,late-7) * (1 + 0.04*late)`.

Days 1-14 keep their previous formulas. Relative to the preceding 1.24/1.18 HP and 1.15/1.12 damage segments, D21 HP is `(1.28/1.24)^7 = 1.248872` times (+24.89%) and damage is `(1.18/1.15)^7 = 1.197538` times (+19.75%). D30 adds nine days of the later segment: HP is `(1.28/1.24)^7 * (1.22/1.18)^9 = 1.685848` times (+68.58%), and damage is `(1.18/1.15)^7 * (1.15/1.12)^9 = 1.519174` times (+51.92%). These compare curves at the same day, not outcomes across different maps.

### Default Five-Seed Runs

Fresh exported `run(30,'balanced',seed)` calls used default current maps (map generation 2), skills enabled, two towers per gate, one optional fortune, no reinforcement and a 36,000-second timeout. CLI reproduction from the project directory:

```sh
node scripts/estate-balance-sim.js --days=30 --seeds=1,7,42,73193,99991 --style=balanced
npm test
```

| Seed | Completed nights | Defeat night | Elapsed seconds | First ordinary Lv9 | Shrine Lv15 | Full planned Lv9 |
| --- | ---: | ---: | ---: | --- | --- | --- |
| 1 | 22 | 23 | 2952.25 | unreached | unreached | unreached |
| 7 | 19 | 20 | 2538.25 | unreached | unreached | unreached |
| 42 | 19 | 20 | 2635.75 | unreached | unreached | unreached |
| 73193 | 21 | 22 | 2967.25 | unreached | unreached | unreached |
| 99991 | 21 | 22 | 2933.25 | unreached | unreached | unreached |

All five ended in defeat, with no timeouts and 0/5 D30 clears. All five default-map runs completed D15; this is an observation, not a retained D15 survival guarantee. Only seeds 1, 73193 and 99991 cleared D20; defeat on D20 does not clear that night. No progression date was reached before defeat.

### Tests And Reinforcement

Exact enemy tests now cover the stronger D1-D31 curves, explicit D15/D21/D30 stats, ratios to D1 and later segment transitions. The historical-map late regression retains five-seed survival through all fourteen opening nights, pressure checks and no ordinary Lv9 before D20, without hardcoding D15 completion by seed.

The first `npm test` run passed 89/90 tests. Its only failure was the old requirement that seed 1 reinforcement survive to a strictly later day. Fresh historical-map (`mapGeneration:1`) comparisons instead both defeated on D23: default at 2956.75 seconds and reinforcement at 2975.00 seconds. The four extra towers were paid builds on D15 at seconds 1707/1708/1709/1710. The revised test checks pre-D15 history identity, fourteen completed opening nights, delayed progression and legal delayed construction; it no longer promises an extra survival day.

Final verification: `npm test` passed all 90 tests with zero failures, and `git diff --check` passed. Only `tests/game.test.js`, `tests/balance.test.js` and this report were edited for this update, using `apply_patch`. No build was run, no production source was edited and no historical artifact was changed. Default-map runs and historical-map regressions are explicitly separate measurements; the fixed heuristic and five-seed sample do not establish a universal survival guarantee.
